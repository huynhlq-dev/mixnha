import { normHex } from '../core/color';
import { clamp, snapAngle } from '../core/geometry';
import { canEdit, clearAll, clearScope, countItems, duplicateItem, findItem, freshLayout, isRoomId, removeItem, setRoomDim as applyRoomDim } from '../core/layout';
import { LIMITS, ROOM_DIM_LIMITS, type RoomDimKey } from '../core/limits';
import {
  addFloorItem,
  addWallItem,
  isFull,
  nudge,
  parseWhole,
  resetTo,
  rotateBy as rotateItem,
  setFloorSize,
  setRotation as setItemRotation,
  setWallField,
  toggleLock as toggleItemLock,
  type Dir,
  type FloorField,
  type WallField,
} from '../core/ops';
import { registry as defaultRegistry, type Registry } from '../core/registry';
import { roomGeo, type RoomGeo } from '../core/room';
import type { FloorItem, Layout, Layouts, Selection, WallItem } from '../core/types';
import { FLOOR_COLORS, ITEM_COLORS, WALL_COLORS } from '../data/palettes';
import { ROOM_IDS, ROOMS, type RoomId } from '../data/rooms';
import type { WallKey } from '../data/schema';
import { WALL_KEYS } from '../data/walls';
import { loadBackup, markDirty, markExported, saveBackup, shouldRemind, snooze, type BackupState } from '../storage/backup';
import { layoutFromImported, type ImportedRoom, type ParsedFile } from '../storage/file';
import { History } from '../storage/history';
import type { KV } from '../storage/kv';
import { loadState, saveState, type PenPrefs, type SavedMeta } from '../storage/save';
import type { Frame } from '../views/frame';
import type { DropAt, Host, Mode, PenTarget, PenTool, ViewState } from '../views/host';
import { describe3D, type Info3D } from '../views/info3d';
import type { Scene3D } from '../views/scene3d';
import { Stage2D } from '../views/stage2d';
import type { Els } from './els';
import { ExportDialog } from './exportDialog';
import { Fullscreen3D } from './fullscreen';
import { ImportDialog } from './importDialog';
import { bindKeys, type KeyAction, type KeyContext } from './keys';
import { Library } from './library';
import { MobileUi, type MobileApp } from './mobile';
import { miniMapHtml, revealActive, roomTabsHtml, wallTabsHtml } from './nav';
import { bindPen, colorAt, paintAt, rememberColor, updatePenUi, type PenApp } from './pen';
import { bindProps, paintRotation, updateProps, type PropsApp, type SelModel } from './props';
import { remindMessage } from './remind';
import { bindSwatches, swatchesHtml, type SwatchApp, type SwatchKey } from './swatches';
import { Toast } from './toast';

/** Phần 3D (kèm three.js) nạp riêng khi người dùng mở 3D lần đầu, để trang mở nhanh hơn. */
export type SceneModule = typeof import('../views/scene3d');

export interface AppDeps {
  els: Els;
  kv: KV;
  registry?: Registry;
  now?: () => number;
  loadScene?: () => Promise<SceneModule>;
  /** Thay được khi kiểm thử. */
  download?: (filename: string, text: string) => void;
  copy?: (text: string) => Promise<boolean>;
}

const LOCKED = {
  move: 'Món này đã khóa nên không di chuyển được. Mở khóa ở bảng bên phải nếu muốn sửa.',
  rotate: 'Món này đã khóa nên không xoay được. Mở khóa ở bảng bên phải nếu muốn xoay.',
  resize: 'Món này đã khóa nên không đổi kích thước được. Mở khóa ở bảng bên phải nếu muốn sửa.',
  delete: 'Món này đã khóa nên không xóa được. Mở khóa ở bảng bên phải nếu muốn xóa.',
} as const;

const FULL_MSG = `Phòng này đã có ${LIMITS.maxItemsPerRoom} món, là mức tối đa. Hãy xóa bớt món trước khi thêm.`;

const isWallKey = (v: unknown): v is WallKey => typeof v === 'string' && (WALL_KEYS as readonly string[]).includes(v);
const isMode = (v: unknown): v is Mode => v === 'plan' || v === 'elev' || v === '3d';

/**
 * Ứng dụng: giữ trạng thái (bản vẽ từng phòng, kiểu xem, món đang chọn, bút màu), nối giao diện với views/ và storage/.
 * Hai cách vẽ lại: render() chỉ vẽ lại khung bản vẽ; refresh() vẽ lại cả bảng thuộc tính, ghi một bước Hoàn tác và lưu.
 * App là Host của views: views không biết gì về thư viện, bảng thuộc tính hay hộp thoại.
 */
export class App implements Host, PropsApp, PenApp, SwatchApp, MobileApp {
  readonly registry: Registry;

  private readonly els: Els;
  private readonly kv: KV;
  private readonly now: () => number;
  private readonly loadSceneModule: () => Promise<SceneModule>;

  private layouts = {} as Layouts;
  private room: RoomId = ROOM_IDS[0];
  private readonly v: ViewState = { mode: 'plan', wall: 'T', sel: null, dim: true, snap: true, pen: null };
  private penPrefs: PenPrefs = { color: '#e3b7a0', recent: [] };
  private meta: SavedMeta = { name: '', note: '' };
  private backup: BackupState = {};
  private uid = 0;
  private readonly nextUid = (): number => ++this.uid;
  private readonly history = new History();

  private readonly stage: Stage2D;
  private scene: Scene3D | null = null;
  private sceneLoading = false;
  private sceneFailed = false;
  private readonly library: Library;
  private readonly mobile: MobileUi;
  private readonly full: Fullscreen3D;
  private readonly toast: Toast;
  private readonly exportDlg: ExportDialog;
  private readonly importDlg: ImportDialog;
  private readonly off: (() => void)[] = [];
  private warnedSave = false;

  constructor(d: AppDeps) {
    this.els = d.els;
    this.kv = d.kv;
    this.registry = d.registry ?? defaultRegistry;
    this.now = d.now ?? Date.now;
    this.loadSceneModule = d.loadScene ?? (() => import('../views/scene3d'));
    const { els } = this;

    this.stage = new Stage2D(els.plan, this);
    this.stage.onZoomChange = () => this.updateZoomBar();
    this.toast = new Toast(els.toast);
    this.full = new Fullscreen3D(els.view3d, els.btnFull);
    this.mobile = new MobileUi(els, this, els.editor);
    this.library = new Library(els, this.registry, (id) => {
      this.drop(id, null);
      this.mobile.afterPick();
    });
    this.exportDlg = new ExportDialog(els, {
      layouts: () => this.layouts,
      room: () => this.room,
      meta: () => this.meta,
      setMeta: (m) => {
        this.meta = m;
        this.persist();
      },
      now: () => new Date(this.now()),
      onExported: () => this.exported(),
      notice: (t) => this.notice(t),
      download: d.download,
      copy: d.copy,
    });
    this.importDlg = new ImportDialog(els, { registry: this.registry, apply: (rooms, file) => this.applyImport(rooms, file) });

    bindProps(els, this);
    bindPen(els, this);
    bindSwatches([els.floorSw, els.wallSw, els.itemSw, els.penRecent], this);
    this.bindToolbar();
    this.off.push(
      bindKeys(
        () => this.keyContext(),
        (a) => this.runKey(a),
      ),
      this.importDlg.bindPageDrop(),
    );
    const onVisible = (): void => {
      if (!document.hidden) this.updateRemind();
    };
    document.addEventListener('visibilitychange', onVisible);
    this.off.push(() => document.removeEventListener('visibilitychange', onVisible));
  }

  /** Đọc dữ liệu đã lưu, dựng giao diện và vẽ lần đầu. */
  start(): void {
    const { els } = this;
    this.loadInitial();
    els.rooms.innerHTML = roomTabsHtml(this.room);
    els.walls.innerHTML = wallTabsHtml(this.v.wall);
    els.floorSw.innerHTML = swatchesHtml('floor', FLOOR_COLORS);
    els.wallSw.innerHTML = swatchesHtml('wall', WALL_COLORS);
    els.itemSw.innerHTML = swatchesHtml('item', ITEM_COLORS);
    this.library.setMode(this.v.mode);
    this.render();
    this.updatePanels();
    this.updateRemind();
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off.length = 0;
    this.stage.dispose();
    this.scene?.dispose();
    this.mobile.dispose();
    this.full.dispose();
    this.toast.dispose();
  }

  private loadInitial(): void {
    const saved = loadState(this.kv, this.registry, this.nextUid);
    const layouts: Partial<Layouts> = saved?.layouts ?? {};
    for (const id of ROOM_IDS) layouts[id] ??= freshLayout(ROOMS[id], this.registry, this.nextUid);
    this.layouts = layouts as Layouts;
    if (saved) {
      this.room = saved.room;
      if (saved.pen) this.penPrefs = saved.pen;
      this.meta = saved.meta;
    }
    this.history.reset(this.layouts);
    this.backup = loadBackup(this.kv);
  }

  /* ---------- Host: những gì views cần ---------- */

  layout(): Layout {
    return this.layouts[this.room];
  }

  geo(): RoomGeo {
    return roomGeo(ROOMS[this.room], this.layout());
  }

  view(): Readonly<ViewState> {
    return this.v;
  }

  select(sel: Selection | null): void {
    this.v.sel = sel;
    this.render();
    this.updatePanels();
  }

  changing(): void {
    this.render();
    const sel = this.v.sel;
    const it = this.selItem();
    if (sel?.scope === 'floor' && it) paintRotation(this.els, it as FloorItem);
  }

  changed(): void {
    this.refresh(false);
  }

  pen(target: PenTarget | null): void {
    if (!target || !this.v.pen) return;
    const l = this.layout();
    if (this.v.pen === 'pick') {
      const c = normHex(colorAt(l, target));
      if (!c) return;
      this.penPrefs = { color: c, recent: rememberColor(this.penPrefs.recent, c) };
      this.v.pen = 'paint';
    } else {
      if (!paintAt(l, target, this.penPrefs.color)) return;
      this.penPrefs = { ...this.penPrefs, recent: rememberColor(this.penPrefs.recent, this.penPrefs.color) };
    }
    this.refresh(false);
  }

  drop(id: string, at: DropAt | null): void {
    const def = this.registry.resolve(id);
    if (!def || def.status !== 'live') return;
    const l = this.layout();
    const mode = this.v.mode;
    // thư viện mặt bằng chỉ có đồ sàn, mặt đứng chỉ có đồ tường; món lạc loài (kéo từ chỗ khác tới) thì bỏ qua
    if ((def.place === 'wall' && mode === 'plan') || (def.place === 'floor' && mode === 'elev')) return;
    if (isFull(l)) {
      this.notice(FULL_MSG);
      return;
    }
    if (mode === '3d') this.scene?.stopAuto();
    let sel: Selection;
    if (def.place === 'wall') {
      const onWall = at?.kind === 'wall' ? at : null;
      const wall = onWall?.wall ?? (mode === 'elev' ? this.v.wall : (this.scene?.farWall() ?? 'T'));
      sel = addWallItem(l, def, wall, onWall?.s ?? null, onWall?.y ?? null, this.v.snap, this.nextUid());
    } else {
      sel = addFloorItem(l, def, at?.kind === 'plan' ? at : null, this.v.snap, this.nextUid());
    }
    this.v.sel = sel;
    this.refresh(false);
  }

  rotateBy(delta: number): void {
    const sel = this.v.sel;
    const it = this.selItem();
    if (!sel || !it || sel.scope !== 'floor') return;
    if (!rotateItem(it as FloorItem, delta)) {
      this.notice(LOCKED.rotate);
      return;
    }
    this.refresh(false);
  }

  removeSelected(): void {
    const sel = this.v.sel;
    if (!sel) return;
    if (!this.selItem()) {
      this.v.sel = null;
      return;
    }
    if (!removeItem(this.layout(), sel)) {
      this.notice(LOCKED.delete);
      return;
    }
    this.v.sel = null;
    this.refresh(false);
  }

  notice(text: string): void {
    this.toast.show(text);
  }

  /* ---------- Chọn phòng, kiểu xem, tường ---------- */

  setRoom(id: RoomId): void {
    if (id === this.room) return;
    this.room = id;
    this.v.sel = null;
    this.scene?.forgetRoom();
    this.refresh(false);
  }

  setMode(mode: Mode): void {
    if (mode === this.v.mode) return;
    if (mode !== '3d') {
      this.full.set(false);
      this.scene?.hide();
    } else {
      // vào 3D thì luôn nhìn lại từ góc chéo
      this.scene?.forgetRoom();
    }
    this.v.mode = mode;
    this.v.sel = null;
    this.library.setMode(mode);
    this.refresh(false);
  }

  setWall(wall: WallKey): void {
    this.v.wall = wall;
    this.v.sel = null;
    this.refresh(false);
  }

  /* ---------- Hoàn tác, bố trí mẫu, xóa ---------- */

  undo(): void {
    const snap = this.history.undo(this.room);
    if (snap) this.applySnapshot(snap);
  }

  redo(): void {
    const snap = this.history.redo(this.room);
    if (snap) this.applySnapshot(snap);
  }

  private applySnapshot(snap: Layout): void {
    this.layouts[this.room] = snap;
    this.v.sel = null;
    this.render();
    this.updatePanels();
    this.touched();
    this.persist();
  }

  reset(): void {
    const { mode, wall } = this.v;
    const fresh = freshLayout(ROOMS[this.room], this.registry, this.nextUid);
    resetTo(this.layout(), fresh, mode === 'elev' ? wall : mode === '3d' ? 'all' : 'plan');
    this.v.sel = null;
    this.refresh(false);
  }

  clear(): void {
    const { mode, wall } = this.v;
    const l = this.layout();
    const before = countItems(l);
    if (mode === 'elev') clearScope(l, wall);
    else if (mode === '3d') clearAll(l);
    else clearScope(l, 'floor');
    const removed = before - countItems(l);
    const kept = (mode === 'elev' ? l.walls[wall].length : mode === '3d' ? countItems(l) : l.items.length) || 0;
    this.v.sel = null;
    this.refresh(false);
    if (kept > 0) this.notice(removed > 0 ? `Đã xóa ${removed} món. ${kept} món đã khóa được giữ lại.` : 'Các món ở đây đều đã khóa nên không xóa. Mở khóa từng món nếu muốn xóa.');
  }

  /* ---------- Sửa món đang chọn (bảng thuộc tính) ---------- */

  private selItem() {
    return findItem(this.layout(), this.v.sel);
  }

  private selModel(): SelModel | null {
    const sel = this.v.sel;
    const item = this.selItem();
    if (!sel || !item) return null;
    const def = this.registry.resolve(item.id);
    return { scope: sel.scope, item, note: def?.note, custom: !def };
  }

  /** Số gõ vào ô: hợp lệ thì dùng ngay; đang gõ dở thì chờ; rời ô thì kẹp về khoảng cho phép (ô trống thì giữ số cũ). */
  private readWhole(raw: string, range: { min: number; max: number }, current: number, final: boolean): number | null {
    const ok = parseWhole(raw, range.min, range.max);
    if (ok !== null) return ok;
    if (!final) return null;
    const n = Number(raw);
    return raw.trim() === '' || !Number.isFinite(n) ? current : clamp(Math.round(n), range.min, range.max);
  }

  /** Gõ dở thì chỉ vẽ lại bản vẽ (không đụng ô đang gõ); xong thì vẽ lại cả bảng. Cả hai gộp vào một bước Hoàn tác nếu liền nhau. */
  private commitEdit(final: boolean): void {
    if (final) {
      this.refresh(true);
    } else {
      this.render();
      this.save(true);
    }
  }

  setRoomDim(key: RoomDimKey, raw: string, final: boolean): number | null {
    const l = this.layout();
    const v = this.readWhole(raw, ROOM_DIM_LIMITS[key], l[key], final);
    if (v === null) return null;
    if (v !== l[key]) {
      applyRoomDim(l, key, v);
      this.commitEdit(final);
    }
    return v;
  }

  setField(field: 'w' | 'd' | 'y', raw: string, final: boolean): number | null {
    const sel = this.v.sel;
    const it = this.selItem();
    if (!sel || !it) return null;
    const onWall = sel.scope !== 'floor';
    const key = field === 'd' && onWall ? 'h' : field;
    const range = key === 'y' ? LIMITS.itemY : LIMITS.itemSize;
    const current = (it as unknown as Record<string, number>)[key]!;
    const v = this.readWhole(raw, range, current, final);
    if (v === null) return null;
    if (v === current) return v;
    const ok = onWall ? setWallField(it as WallItem, key as WallField, v) : setFloorSize(it as FloorItem, key as FloorField, v);
    if (!ok) {
      this.notice(key === 'y' ? LOCKED.move : LOCKED.resize);
      return current;
    }
    this.commitEdit(final);
    return v;
  }

  setRotation(deg: number, final: boolean): number | null {
    const sel = this.v.sel;
    const it = this.selItem();
    if (sel?.scope !== 'floor' || !it) return null;
    if (!setItemRotation(it as FloorItem, deg)) {
      this.notice(LOCKED.rotate);
      return null;
    }
    this.commitEdit(final);
    this.changing();
    return (it as FloorItem).rot;
  }

  toggleLock(): void {
    const it = this.selItem();
    if (!it) return;
    toggleItemLock(it);
    this.refresh(false);
  }

  duplicate(): void {
    const sel = this.v.sel;
    if (!sel) return;
    const l = this.layout();
    if (isFull(l)) {
      this.notice(FULL_MSG);
      return;
    }
    const copy = duplicateItem(l, sel, this.nextUid);
    if (!copy) return;
    this.v.sel = copy;
    this.refresh(false);
  }

  knobStart(): number | null {
    const it = this.selItem();
    if (this.v.sel?.scope !== 'floor' || !it || !canEdit(it, 'rotate')) return null;
    return (it as FloorItem).rot;
  }

  knobMove(deg: number, shift: boolean): void {
    const it = this.selItem();
    if (this.v.sel?.scope !== 'floor' || !it) return;
    if (setItemRotation(it as FloorItem, snapAngle(deg, shift, this.v.snap))) this.changing();
  }

  knobEnd(): void {
    this.refresh(false);
  }

  /* ---------- Màu ---------- */

  pickColor(key: SwatchKey, hex: string, how: 'click' | 'live' | 'done'): void {
    const c = normHex(hex);
    if (!c) return;
    if (key === 'pen') {
      this.penPrefs = { ...this.penPrefs, color: c };
      if (!this.v.pen) this.v.pen = 'paint';
      this.persist();
      this.updatePenUi();
      return;
    }
    const l = this.layout();
    if (key === 'floor') l.floor = c;
    else if (key === 'wall') l.wall = c;
    else {
      const it = this.selItem();
      if (!it) return;
      it.color = c;
    }
    if (how === 'done') this.penPrefs = { ...this.penPrefs, recent: rememberColor(this.penPrefs.recent, c) };
    this.refresh(how !== 'click');
  }

  setPenColor(hex: string, how: 'live' | 'done'): void {
    this.penPrefs = { color: hex, recent: how === 'done' ? rememberColor(this.penPrefs.recent, hex) : this.penPrefs.recent };
    this.persist();
    this.updatePenUi();
  }

  toggleTool(tool: 'pick' | 'paint'): void {
    this.setTool(this.v.pen === tool ? null : tool);
  }

  syncPen(): void {
    this.updatePenUi();
  }

  private setTool(tool: PenTool): void {
    this.v.pen = tool;
    this.updatePenUi();
  }

  private updatePenUi(): void {
    updatePenUi(this.els, this.penPrefs, this.v.pen);
  }

  /* ---------- Nhập, xuất, nhắc sao lưu ---------- */

  private applyImport(rooms: ImportedRoom[], file: ParsedFile): void {
    for (const r of rooms) {
      this.layouts[r.id] = layoutFromImported(r, this.nextUid);
      // mỗi phòng nhập vào là một bước Hoàn tác riêng của phòng đó
      this.history.commit(r.id, this.layouts[r.id], false);
    }
    if (!rooms.some((r) => r.id === this.room)) this.room = rooms[0]!.id;
    if (file.name || file.note) this.meta = { name: file.name, note: file.note };
    this.v.sel = null;
    this.scene?.forgetRoom();
    this.touched();
    this.refresh(false);
    this.notice(`Đã nhập ${rooms.length} phòng từ file. Nhập nhầm thì bấm Hoàn tác ở từng phòng.`);
  }

  private exported(): void {
    this.backup = markExported(this.backup, this.now());
    saveBackup(this.kv, this.backup);
    this.updateRemind();
  }

  private updateRemind(): void {
    const now = this.now();
    const show = shouldRemind(this.backup, now);
    this.els.remind.hidden = !show;
    if (show) this.els.remindText.textContent = remindMessage(this.backup, now);
  }

  /** Bản vẽ vừa có thay đổi chưa xuất ra file. */
  private touched(): void {
    this.backup = markDirty(this.backup, this.now());
    saveBackup(this.kv, this.backup);
  }

  /* ---------- Vẽ ---------- */

  /** Vẽ lại khung bản vẽ (mặt bằng, mặt đứng hoặc 3D) và dòng tiêu đề, trạng thái. */
  private render(): void {
    const { els, v } = this;
    const l = this.layout();
    if (v.sel && !findItem(l, v.sel)) v.sel = null;
    const is3d = v.mode === '3d';
    els.plan.toggleAttribute('hidden', is3d);
    els.view3d.hidden = !is3d;
    els.legend.hidden = is3d;
    els.zoombar.hidden = is3d;
    if (is3d) this.render3d();
    else this.showInfo(this.stage.render());
  }

  private render3d(): void {
    if (!this.scene && !this.sceneLoading && !this.sceneFailed) this.ensureScene();
    const s = this.scene;
    s?.show();
    const info = describe3D(this.layout(), this.geo(), this.registry, !!s?.failed);
    if (!s && !this.sceneFailed) info.status = { tone: 'good', text: 'Đang tải khung 3D...' };
    else if (!s) info.status = { tone: 'good', text: 'Không tải được phần 3D. Hãy kiểm tra kết nối mạng rồi tải lại trang. Mặt bằng và mặt đứng vẫn dùng bình thường.' };
    this.showInfo(info);
  }

  private ensureScene(): void {
    this.sceneLoading = true;
    this.loadSceneModule()
      .then(({ Scene3D }) => {
        const s = new Scene3D(this.els.view3d, this);
        s.onAutoChange = (on) => this.els.btnAuto.setAttribute('aria-pressed', String(on));
        if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) s.stopAuto();
        this.scene = s;
      })
      .catch(() => {
        this.sceneFailed = true;
      })
      .then(() => {
        this.sceneLoading = false;
        if (this.v.mode === '3d') this.render();
      });
  }

  private showInfo(f: Pick<Frame, 'title' | 'size' | 'area' | 'status'> | Info3D): void {
    const { els } = this;
    els.roomName.textContent = f.title;
    els.roomSize.textContent = f.size;
    els.roomArea.textContent = f.area;
    els.status.className = `status ${f.status.tone}`;
    els.status.textContent = f.status.text;
  }

  /** Vẽ lại cả bảng thuộc tính, ghi một bước Hoàn tác (nếu bản vẽ đã khác) và lưu. continuous: thao tác liên tục, gộp bước nếu liền nhau. */
  private refresh(continuous: boolean): void {
    this.render();
    this.updatePanels();
    this.save(continuous);
  }

  private updatePanels(): void {
    const { els, v } = this;
    const sel = this.selModel();
    if (v.sel && !sel) v.sel = null;
    updateProps(els, { layout: this.layout(), mode: v.mode, sel });
    this.updatePenUi();

    const press = (box: HTMLElement, attr: 'room' | 'mode' | 'wall', current: string): void => {
      for (const b of box.querySelectorAll<HTMLElement>(`[data-${attr}]`)) b.setAttribute('aria-pressed', String(b.dataset[attr] === current));
    };
    press(els.rooms, 'room', this.room);
    press(els.modes, 'mode', v.mode);
    press(els.walls, 'wall', v.wall);
    els.wallsRow.hidden = v.mode !== 'elev';
    revealActive(els.rooms);
    revealActive(els.walls);
    els.mini.innerHTML = miniMapHtml(v.wall);

    const is3d = v.mode === '3d';
    const elev = v.mode === 'elev';
    els.btnDim.disabled = is3d;
    els.btnReset.textContent = elev ? 'Mẫu tường này' : 'Bố trí mẫu';
    els.btnReset.title = elev ? 'Đặt tường đang xem về bố trí mẫu. Có thể Hoàn tác.' : 'Đặt đồ, kích thước và màu của phòng về bố trí mẫu. Có thể Hoàn tác.';
    els.btnClear.textContent = elev ? 'Xóa tường này' : is3d ? 'Xóa cả phòng' : 'Xóa đồ sàn';
    els.btnClear.title = elev
      ? 'Xóa mọi món trên tường đang xem. Món đã khóa được giữ lại. Có thể Hoàn tác.'
      : is3d
        ? 'Xóa mọi món của phòng, cả đồ sàn và đồ gắn tường. Món đã khóa được giữ lại. Có thể Hoàn tác.'
        : 'Xóa mọi món đặt trên sàn, đồ gắn tường giữ nguyên. Món đã khóa được giữ lại. Có thể Hoàn tác.';
    this.updateHistoryButtons();
  }

  private updateHistoryButtons(): void {
    this.els.btnUndo.disabled = !this.history.canUndo(this.room);
    this.els.btnRedo.disabled = !this.history.canRedo(this.room);
  }

  private updateZoomBar(): void {
    const vp = this.stage.viewport;
    this.els.zIn.disabled = !vp.canZoomIn;
    this.els.zOut.disabled = !vp.isZoomed;
    this.els.zFit.disabled = !vp.isZoomed;
  }

  /* ---------- Lưu ---------- */

  /** Ghi một bước Hoàn tác nếu bản vẽ đã khác lần trước, rồi lưu vào trình duyệt. */
  private save(continuous: boolean): void {
    if (this.history.commit(this.room, this.layout(), continuous)) this.touched();
    this.persist();
  }

  private persist(): void {
    const ok = saveState(this.kv, this.room, this.layouts, this.penPrefs, this.meta);
    if (!ok && !this.warnedSave) {
      this.warnedSave = true;
      this.notice('Trình duyệt không cho lưu tự động (có thể đang ở chế độ riêng tư). Hãy bấm Xuất file để giữ bản vẽ.');
    }
    this.updateHistoryButtons();
    this.updateRemind();
  }

  /* ---------- Giao diện: thanh công cụ, phím tắt ---------- */

  private bindToolbar(): void {
    const { els } = this;
    const pick = (e: Event, attr: string): string | undefined => (e.target as Element).closest<HTMLElement>(`[data-${attr}]`)?.dataset[attr];
    els.rooms.addEventListener('click', (e) => {
      const id = pick(e, 'room');
      if (isRoomId(id)) this.setRoom(id);
    });
    els.modes.addEventListener('click', (e) => {
      const m = pick(e, 'mode');
      if (isMode(m)) this.setMode(m);
    });
    els.walls.addEventListener('click', (e) => {
      const w = pick(e, 'wall');
      if (isWallKey(w)) this.setWall(w);
    });

    els.btnExport.addEventListener('click', () => this.exportDlg.open());
    els.btnImport.addEventListener('click', () => this.importDlg.open());
    els.btnUndo.addEventListener('click', () => this.undo());
    els.btnRedo.addEventListener('click', () => this.redo());
    els.btnSnap.addEventListener('click', () => {
      this.v.snap = !this.v.snap;
      els.btnSnap.setAttribute('aria-pressed', String(this.v.snap));
    });
    els.btnDim.addEventListener('click', () => {
      this.v.dim = !this.v.dim;
      els.btnDim.setAttribute('aria-pressed', String(this.v.dim));
      this.render();
    });
    els.btnReset.addEventListener('click', () => this.reset());
    els.btnClear.addEventListener('click', () => this.clear());

    els.remindExport.addEventListener('click', () => this.exportDlg.open());
    els.remindLater.addEventListener('click', () => {
      this.backup = snooze(this.backup, this.now());
      saveBackup(this.kv, this.backup);
      this.updateRemind();
    });

    els.zIn.addEventListener('click', () => this.stage.zoomIn());
    els.zOut.addEventListener('click', () => this.stage.zoomOut());
    els.zFit.addEventListener('click', () => this.stage.fit());

    els.btnAuto.addEventListener('click', () => this.scene?.toggleAuto());
    els.btnIso.addEventListener('click', () => this.scene?.viewIso());
    els.btnTop.addEventListener('click', () => this.scene?.viewTop());
    els.btnZi.addEventListener('click', () => this.scene?.zoom(0.8));
    els.btnZo.addEventListener('click', () => this.scene?.zoom(1.25));
    els.btnFull.addEventListener('click', () => this.full.toggle());
  }

  private keyContext(): KeyContext {
    return { mode: this.v.mode, hasSel: !!this.selItem(), selFloor: this.v.sel?.scope === 'floor' };
  }

  private runKey(a: KeyAction): void {
    switch (a.type) {
      case 'undo':
        this.undo();
        break;
      case 'redo':
        this.redo();
        break;
      case 'remove':
        this.removeSelected();
        break;
      case 'rotate':
        this.rotateBy(a.delta);
        break;
      case 'nudge':
        this.nudgeSelected(a.dir, a.step);
        break;
      case 'escape':
        if (this.full.on) this.full.set(false);
        else if (this.mobile.libOpen) this.mobile.setLib(false);
        else if (this.v.pen) this.setTool(null);
        break;
    }
  }

  private nudgeSelected(dir: Dir, step: number): void {
    const sel = this.v.sel;
    const it = this.selItem();
    if (!sel || !it) return;
    if (!canEdit(it, 'move')) {
      this.notice(LOCKED.move);
      return;
    }
    if (nudge(this.layout(), sel.scope, it, dir, step)) {
      this.refresh(true);
      this.stage.focusSelected();
    }
  }
}
