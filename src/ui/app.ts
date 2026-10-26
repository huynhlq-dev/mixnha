import { normHex } from '../core/color';
import { clamp, snapAngle, wallLength } from '../core/geometry';
import { canEdit, clearAll, clearScope, cloneLayout, copyItem, countItems, duplicateItem, findItem, findOpening, freshLayout, pasteItem, removeItem, setRoomDim as applyRoomDim, type Clip } from '../core/layout';
import { LIMITS, ROOM_DIM_LIMITS, type RoomDimKey } from '../core/limits';
import {
  addFloorItem,
  addOpening,
  addWallItem,
  flipDoorHinge as flipHinge,
  isFull,
  isOpeningsFull,
  moveOpening,
  nudge,
  openingRanges,
  openingSpot,
  openingStep,
  parseWhole,
  removeOpening,
  resetTo,
  rotateBy as rotateItem,
  rotateDoor,
  setFloorSize,
  setOpeningWidth,
  setRotation as setItemRotation,
  setWallField,
  toggleDoorSwing as toggleSwing,
  toggleRail as toggleRailOp,
  toggleLock as toggleItemLock,
  type Dir,
  type FloorField,
  type OpeningDrop,
  type WallField,
} from '../core/ops';
import { registry as defaultRegistry, type Registry } from '../core/registry';
import { roomGeo, type RoomGeo } from '../core/room';
import type { AptPlan, DoorItem, FloorItem, Layout, Layouts, OpeningSel, Selection, WallItem } from '../core/types';
import { FLOOR_COLORS, ITEM_COLORS, WALL_COLORS } from '../data/palettes';
import type { OpeningPreset, RoomDef } from '../data/schema';
import { DEFAULT_ROOMS, type RoomEntry, type RoomId } from '../data/rooms';
import { interiorSpace, type Interior } from '../core/interior';
import { roomAreas } from '../core/overlap';
import { buildProject, type ProjectSpec } from '../core/project';
import { MAX_ROOM_NAME, newRoomEntry, roomDef, roomTypeFromDragId } from '../core/rooms';
import type { WallKey } from '../data/schema';
import { isWallKey } from '../data/walls';
import { loadBackup, markDirty, markExported, saveBackup, shouldRemind, snooze, type BackupState } from '../storage/backup';
import { cleanText, FILE_LIMITS, layoutFromImported, type ImportedRoom, type ParsedFile } from '../storage/file';
import { History, type RoomHistory } from '../storage/history';
import type { KV } from '../storage/kv';
import { loadState, saveState, STATE_KEY, type PenPrefs, type SavedMeta } from '../storage/save';
import { apartmentRects, freezePlan, moveOver, resizeOver, roomAtPoint, roomSpot, roomViewInApartment, spotOver, zOnTop, type AptRect, type AptRoom } from '../views/apartment';
import type { Frame } from '../views/frame';
import { renderPlan } from '../views/plan';
import type { Bounds } from '../views/viewport';
import type { DropAt, Host, Mode, PenTarget, PenTool, ViewState } from '../views/host';
import { describe3D, describeApartment3D, type Info3D } from '../views/info3d';
import type { Scene3D } from '../views/scene3d';
import { Stage2D } from '../views/stage2d';
import type { Els } from './els';
import { ExportDialog } from './exportDialog';
import { Fullscreen } from './fullscreen';
import { ImportDialog } from './importDialog';
import { NewProjectDialog } from './newProject';
import { bindKeys, type KeyAction, type KeyContext } from './keys';
import { Library, type LibMode } from './library';
import { MobileUi, type MobileApp } from './mobile';
import { aptInfoHtml, aptListHtml } from './apartmentPanel';
import { miniMapHtml, revealActive, roomTabsHtml, wallTabsHtml } from './nav';
import { bindPen, colorAt, paintAt, penShown, rememberColor, updatePenUi, type PenApp } from './pen';
import { bindProps, paintRotation, updateProps, type OpeningModel, type PropsApp, type SelModel } from './props';
import { remindMessage } from './remind';
import { bindSwatches, swatchesHtml, type SwatchApp, type SwatchKey } from './swatches';
import { bindMenu } from './menu';
import { Tips } from './tips';
import { Toast } from './toast';
import { t, tn } from '../i18n';

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

/** Câu báo khi thao tác trên món đã khóa (đọc lúc cần để theo ngôn ngữ đang chọn). */
const LOCKED = {
  move: () => t('Món này đã khóa nên không di chuyển được. Mở khóa ở bảng bên phải nếu muốn sửa.'),
  rotate: () => t('Món này đã khóa nên không xoay được. Mở khóa ở bảng bên phải nếu muốn xoay.'),
  resize: () => t('Món này đã khóa nên không đổi kích thước được. Mở khóa ở bảng bên phải nếu muốn sửa.'),
  delete: () => t('Món này đã khóa nên không xóa được. Mở khóa ở bảng bên phải nếu muốn xóa.'),
} as const;

/** Khóa nhớ lần xem cuối: "apartment" (mô hình cả căn) hoặc "room" (đang ở trong một phòng). Chưa có thì mở mô hình cả căn. */
export const VIEW_KEY = 'xepnha2d:view';
/** Thời gian bay vùng nhìn khi zoom vào phòng hoặc zoom ra cả căn (ms). */
const ZOOM_MS = 650;

/**
 * Một bước Hoàn tác khi xem cả căn hộ: đổi vị trí các phòng (plan, lưu trước và sau), sửa bản vẽ một phòng (room: đổi cỡ phòng, thêm, kéo,
 * đổi màu đồ... dùng lịch sử của phòng đó), hoặc một thao tác chạm tới nhiều phòng (rooms: kéo đồ sang phòng khác, mỗi phòng một bước lịch sử).
 */
type AptOp =
  /** Dời hoặc đổi cỡ phòng: vị trí và thứ tự lớp các phòng trước và sau, kèm phòng đổi cỡ (Hoàn tác lùi bản vẽ của nó bằng lịch sử của chính phòng). */
  | { kind: 'plan'; before: AptPlan; after: AptPlan; rooms?: RoomId[] }
  | { kind: 'room'; room: RoomId }
  | { kind: 'rooms'; rooms: RoomId[] }
  /** Thêm hoặc xóa một phòng: phòng, bố trí của nó, chỗ nó nằm trong căn và thứ tự trong danh sách. Hoàn tác thêm = xóa và ngược lại. */
  /** history: lịch sử riêng của phòng lúc nó bị bỏ đi, để khi phòng trở lại các bước sửa phòng trước và sau vẫn lùi, tiến đúng. */
  | { kind: 'add'; entry: RoomEntry; layout: Layout; at: { x: number; y: number; z?: number }; index: number; history?: RoomHistory }
  | { kind: 'remove'; entry: RoomEntry; layout: Layout; at: { x: number; y: number; z?: number }; index: number; history?: RoomHistory }
  | { kind: 'rename'; room: RoomId; before: string; after: string };

const clonePlan = (p: AptPlan): AptPlan => JSON.parse(JSON.stringify(p)) as AptPlan;
const samePlan = (a: AptPlan, b: AptPlan): boolean => JSON.stringify(a) === JSON.stringify(b);
/** Số bước Hoàn tác nhớ cho mô hình căn hộ. */
const APT_UNDO = 100;

const fullMsg = (): string => t('Phòng này đã có {max} món, là mức tối đa. Hãy xóa bớt món trước khi thêm.', { max: LIMITS.maxItemsPerRoom });

const v3HintRoom = (): string => t('Kéo nền để xoay · kéo món để di chuyển · cuộn hoặc chụm hai ngón để phóng to');
const v3HintApt = (): string => t('Kéo để xoay · cuộn hoặc chụm hai ngón để phóng to · chỉ để xem, sửa đồ ở Mặt bằng');

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
  /** Các phòng của căn hộ theo thứ tự tab. Thêm, xóa được. */
  private rooms: RoomEntry[] = DEFAULT_ROOMS.map((r) => ({ ...r }));
  private room: RoomId = DEFAULT_ROOMS[0]!.id;
  private readonly v: ViewState = { mode: 'plan', wall: 'T', sel: null, opening: null, overview: true, aptEdit: false, aptSel: null, dim: true, detail: false, snap: true, pen: null };
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
  private readonly full: Fullscreen;
  private readonly toast: Toast;
  private readonly exportDlg: ExportDialog;
  private readonly importDlg: ImportDialog;
  private readonly newDlg: NewProjectDialog;
  private readonly tips: Tips;
  /** Món đã sao chép (Ctrl+C), dán được sang phòng khác; pasteN đếm lần dán liền nhau để mỗi bản lệch thêm một chút. */
  private clip: Clip | null = null;
  private pasteN = 0;
  /** Chưa có bản vẽ tự lưu: lần mở đầu tiên, hiện hộp thoại Dự án mới. */
  private firstRun = false;
  private readonly off: (() => void)[] = [];
  private warnedSave = false;
  /** Đang zoom vào hoặc ra: bỏ qua các lệnh đổi phòng, đổi kiểu xem cho tới khi xong. */
  private zooming = false;
  /** Vị trí các phòng trong mô hình căn hộ; rỗng là tự xếp lưới. */
  private apt: AptPlan = {};
  private aptOps: AptOp[] = [];
  private aptRedoOps: AptOp[] = [];
  /** Đang kéo một phòng trong mô hình: vị trí và lớp lúc bắt đầu (để biết có đổi gì không), phòng nào, đã đổi cỡ chưa. */
  private aptDrag: { plan: AptPlan; room: RoomId; resized: boolean } | null = null;
  /** Các phòng bị đụng tới trong lần kéo đồ sang phòng khác đang diễn ra (phòng nguồn); phòng đích là phòng hiện tại. Ghi lịch sử cùng lúc khi thả. */
  private readonly xfer = new Set<RoomId>();

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
    this.full = new Fullscreen(els.btnFull, els.fullLabel);
    this.mobile = new MobileUi(els, this, els.editor);
    this.library = new Library(els, this.registry, (id) => {
      this.drop(id, null);
      this.mobile.afterPick();
    });
    this.exportDlg = new ExportDialog(els, {
      layouts: () => this.layouts,
      apt: () => this.apt,
      rooms: () => this.rooms,
      room: () => this.room,
      meta: () => this.meta,
      setMeta: (m) => {
        this.meta = m;
        this.persist();
      },
      now: () => new Date(this.now()),
      onExported: () => this.exported(),
      notice: (text) => this.notice(text),
      download: d.download,
      copy: d.copy,
    });
    this.importDlg = new ImportDialog(els, { registry: this.registry, apply: (rooms, file) => this.applyImport(rooms, file) });
    this.newDlg = new NewProjectDialog(els, {
      hasSaved: () => this.kv.get(STATE_KEY) !== null,
      create: (spec, name) => this.newProject(spec, name),
      exportFirst: () => this.exportDlg.open(),
    });

    this.tips = new Tips(els, this.kv);
    bindMenu(els.btnMore, els.moreMenu);
    bindMenu(els.btnHelp, els.helpMenu);
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
    els.rooms.innerHTML = roomTabsHtml(this.rooms, this.room, this.v.overview);
    els.walls.innerHTML = wallTabsHtml(this.v.wall);
    els.opWalls.innerHTML = wallTabsHtml(this.v.wall);
    els.floorSw.innerHTML = swatchesHtml('floor', FLOOR_COLORS);
    els.wallSw.innerHTML = swatchesHtml('wall', WALL_COLORS);
    els.itemSw.innerHTML = swatchesHtml('item', ITEM_COLORS);
    // lần mở đầu tiên: bắt đầu bằng việc chọn các phòng của dự án (bỏ qua thì dùng căn hộ mẫu bốn phòng); mở trước khi vẽ để gợi ý nhanh không hiện phía sau hộp thoại
    if (this.firstRun) this.newDlg.open(true);
    this.library.setMode(this.libMode());
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
    this.firstRun = !saved;
    if (saved) this.rooms = saved.rooms;
    const layouts: Partial<Layouts> = saved?.layouts ?? {};
    for (const e of this.rooms) layouts[e.id] ??= freshLayout(roomDef(e), this.registry, this.nextUid);
    this.layouts = layouts as Layouts;
    if (saved) {
      this.room = saved.room;
      if (saved.pen) this.penPrefs = saved.pen;
      this.meta = saved.meta;
      this.apt = saved.apt;
    }
    this.history.reset(this.layouts);
    this.backup = loadBackup(this.kv);
    this.v.overview = this.kv.get(VIEW_KEY) !== 'room';
  }

  /* ---------- Host: những gì views cần ---------- */

  layout(): Layout {
    return this.layouts[this.room];
  }

  geo(): RoomGeo {
    return roomGeo(this.defOf(this.room), this.layout());
  }

  /** Khai báo của một phòng của căn hộ (loại phòng mang mã và tên của phòng đó). */
  private defOf(id: RoomId): RoomDef {
    return roomDef(this.rooms.find((r) => r.id === id) ?? this.rooms[0]!);
  }

  private hasRoom(id: unknown): id is RoomId {
    return typeof id === 'string' && this.rooms.some((r) => r.id === id);
  }

  view(): Readonly<ViewState> {
    return this.v;
  }

  apartment(): AptRoom[] {
    return this.rooms.map((e) => ({ id: e.id, name: e.name, type: e.type, layout: this.layouts[e.id]!, geo: roomGeo(roomDef(e), this.layouts[e.id]!) }));
  }

  openRoom(id: RoomId): void {
    void this.zoomIntoRoom(id);
  }

  aptPlan(): AptPlan {
    return this.apt;
  }

  aptRects(): Record<RoomId, AptRect> {
    return this.aptGeometry().rects;
  }

  aptStack(): RoomId[] {
    return this.aptGeometry().stack;
  }

  /** Chọn một phòng trên mô hình: phòng đó thành phòng hiện tại và món, cửa đang chọn (nếu có) được bỏ chọn. null: bỏ chọn phòng. */
  aptSelect(id: RoomId | null): void {
    // không đổi gì thì không vẽ lại (vẽ lại giữa hai lần bấm làm mất sự kiện bấm đúp)
    if ((id ?? null) === this.v.aptSel && (!id || (id === this.room && !this.v.sel && !this.v.opening))) return;
    if (id && this.hasRoom(id)) {
      this.room = id;
      this.deselect();
    }
    this.v.aptSel = id && this.hasRoom(id) ? id : null;
    this.render({ keepView: true });
    this.updatePanels();
  }

  focusRoom(id: RoomId): void {
    if (!this.hasRoom(id)) return;
    const same = id === this.room && this.v.aptSel === id;
    if (id !== this.room) {
      this.room = id;
      this.deselect();
    }
    this.v.aptSel = id;
    if (!same) {
      // phòng được chọn đổi: vẽ lại khung chọn phòng và cập nhật cột phải
      this.render({ keepView: true });
      this.updatePanels();
    }
  }

  transferItem(sel: Selection, to: RoomId, p: { x: number; y: number }): boolean {
    const from = this.room;
    if (sel.scope !== 'floor' || from === to || !this.hasRoom(to)) return false;
    const src = this.layouts[from];
    const dst = this.layouts[to];
    const it = findItem(src, sel) as FloorItem | undefined;
    if (!it || !dst) return false;
    if (isFull(dst)) {
      this.notice(t('{name} đã có {max} món, là mức tối đa nên không chuyển đồ vào được.', { name: tn(this.defOf(to).name), max: LIMITS.maxItemsPerRoom }));
      return false;
    }
    src.items = src.items.filter((x) => x.uid !== it.uid);
    it.x = clamp(p.x, 0, dst.W);
    it.y = clamp(p.y, 0, dst.H);
    dst.items.push(it);
    this.xfer.add(from);
    this.room = to;
    this.v.aptSel = to;
    this.render({ keepView: true });
    this.updatePanels();
    return true;
  }

  /** Bắt đầu một lần kéo: chốt vị trí mọi phòng (để các phòng không tự nhảy khi một phòng đổi cỡ) và chụp lại để so khi thả. */
  private aptBegin(room: RoomId): void {
    if (this.aptDrag) return;
    if (Object.keys(this.apt).length < this.rooms.length) this.apt = freezePlan(this.aptGeometry().rects, this.apt);
    this.aptDrag = { plan: clonePlan(this.apt), room, resized: false };
  }

  /** Đặt vị trí của phòng đang kéo kèm thứ tự lớp: chồng lên phòng nào thì nằm trên phòng đó, không chồng thì về lớp ban đầu. */
  private placeDragged(id: RoomId, x: number, y: number): void {
    const base = this.aptDrag?.plan[id]?.z;
    this.apt = { ...this.apt, [id]: { x, y, ...(base ? { z: base } : {}) } };
    const z = zOnTop(this.aptGeometry().rects, this.apt, id);
    this.apt = { ...this.apt, [id]: { x, y, ...(z ? { z } : {}) } };
  }

  aptMoveTo(id: RoomId, x: number, y: number): void {
    this.aptBegin(id);
    const g = this.aptGeometry();
    const last = this.apt[id] ?? g.rects[id]!;
    const pos = moveOver(g.rects, g.stack, id, last, { x, y }, this.v.snap);
    const before = JSON.stringify(this.apt[id]);
    this.placeDragged(id, pos.x, pos.y);
    if (JSON.stringify(this.apt[id]) === before) return;
    this.render({ keepView: true });
    this.paintAptSel();
  }

  /** Đổi cỡ phòng, trả về cỡ thực tế đã dùng (sau khi kẹp; được đè lên phòng khác, nhưng mỗi phòng phải còn đủ phần thấy, không thì giữ cỡ trước). */
  private aptResize(id: RoomId, w: number, h: number, snap: boolean): { w: number; h: number } {
    this.aptBegin(id);
    const g = this.aptGeometry();
    const cur = g.rects[id]!;
    const size = resizeOver(g.rects, g.stack, id, { w: cur.w, h: cur.h }, { w, h }, snap);
    if (size.w !== cur.w || size.h !== cur.h) {
      const l = this.layouts[id]!;
      applyRoomDim(l, 'W', size.w);
      applyRoomDim(l, 'H', size.h);
      if (this.aptDrag) this.aptDrag.resized = true;
      this.placeDragged(id, cur.x, cur.y);
      this.render({ keepView: true });
      this.paintAptSel();
    }
    return size;
  }

  aptResizeTo(id: RoomId, w: number, h: number): void {
    this.aptResize(id, w, h, this.v.snap);
  }

  aptCommit(): void {
    const d = this.aptDrag;
    this.aptDrag = null;
    if (!d) return;
    const resized = d.resized && this.history.commit(d.room, this.layouts[d.room]!, false);
    const moved = !samePlan(d.plan, this.apt);
    // dời, đổi lớp và đổi cỡ trong một lần kéo là một bước Hoàn tác duy nhất
    if (moved || resized) {
      this.pushAptOp({ kind: 'plan', before: d.plan, after: clonePlan(this.apt), ...(resized ? { rooms: [d.room] } : {}) });
      this.touched();
    }
    this.persist();
    this.paintAptSel();
    this.updatePanels();
    void this.refitApartment();
  }

  private pushAptOp(op: AptOp): void {
    this.aptOps.push(op);
    if (this.aptOps.length > APT_UNDO) this.aptOps.shift();
    this.aptRedoOps = [];
  }

  /** Sau khi bố cục đổi: chỉnh khung nhìn êm êm cho vừa cả căn (căn có thể rộng ra hay hẹp lại). */
  private async refitApartment(): Promise<void> {
    if (!this.v.overview) return;
    await this.stage.animateTo(this.aptGeometry().bounds, this.zoomMs() > 0 ? 280 : 0);
    if (this.v.overview) this.stage.fit();
  }

  private aptUndo(): void {
    const op = this.aptOps.pop();
    if (!op) return;
    const before = this.aptGeometry().bounds;
    this.applyAptOp(op, 'undo');
    this.aptRedoOps.push(op);
    this.deselect();
    this.afterAptHistory(before);
  }

  private aptRedo(): void {
    const op = this.aptRedoOps.pop();
    if (!op) return;
    const before = this.aptGeometry().bounds;
    this.applyAptOp(op, 'redo');
    this.aptOps.push(op);
    this.deselect();
    this.afterAptHistory(before);
  }

  private applyAptOp(op: AptOp, dir: 'undo' | 'redo'): void {
    if (op.kind === 'plan') {
      this.apt = clonePlan(dir === 'undo' ? op.before : op.after);
      for (const room of op.rooms ?? []) {
        const snap = dir === 'undo' ? this.history.undo(room) : this.history.redo(room);
        if (snap) this.layouts[room] = snap;
      }
      return;
    }
    if (op.kind === 'rename') {
      this.rooms = this.rooms.map((r) => (r.id === op.room ? { ...r, name: dir === 'undo' ? op.before : op.after } : r));
      return;
    }
    if (op.kind === 'add' || op.kind === 'remove') {
      // thêm rồi làm lại, hoặc xóa rồi hoàn tác: đưa phòng trở lại; ngược lại thì bỏ phòng đi (giữ bố cục và chỗ mới nhất để làm lại không mất việc đã làm)
      if ((op.kind === 'add') === (dir === 'redo')) {
        this.insertRoom({ ...op.entry }, cloneLayout(op.layout), { ...op.at }, Math.min(op.index, this.rooms.length));
        if (op.history) this.history.restore(op.entry.id, op.history);
      } else {
        const cur = this.layouts[op.entry.id];
        if (cur) op.layout = cloneLayout(cur);
        const at = this.apt[op.entry.id];
        if (at) op.at = { ...at };
        op.history = this.history.snapshot(op.entry.id) ?? undefined;
        this.removeRoomEntry(op.entry.id);
      }
      return;
    }
    for (const room of op.kind === 'rooms' ? op.rooms : [op.room]) {
      const snap = dir === 'undo' ? this.history.undo(room) : this.history.redo(room);
      if (snap) this.layouts[room] = snap;
    }
  }

  /* ---------- Dự án mới ---------- */

  /** Bắt đầu dự án mới: thay toàn bộ phòng, bản vẽ, vị trí và lịch sử bằng các phòng đã chọn, rồi xem mô hình cả căn hộ. */
  newProject(spec: ProjectSpec, name: string): void {
    if (this.zooming) return;
    const built = buildProject(spec, this.registry, this.nextUid);
    this.rooms = built.rooms;
    this.layouts = built.layouts;
    this.room = built.rooms[0]!.id;
    this.apt = {};
    this.aptOps = [];
    this.aptRedoOps = [];
    this.aptDrag = null;
    this.xfer.clear();
    this.history.reset(this.layouts);
    this.meta = { name: cleanText(name, FILE_LIMITS.maxName), note: '' };
    // dự án mới chưa có gì để nhắc sao lưu
    this.backup = {};
    saveBackup(this.kv, this.backup);
    Object.assign(this.v, { mode: 'plan', wall: 'T', sel: null, opening: null, overview: true, aptEdit: false, aptSel: null, pen: null });
    this.setTool(null);
    this.scene?.hide();
    this.scene?.forgetRoom();
    this.library.setMode(this.libMode());
    this.kv.set(VIEW_KEY, 'apartment');
    this.render();
    this.stage.fit();
    this.updatePanels();
    this.persist();
    this.notice(t('Đã tạo dự án mới gồm {n} phòng. Kéo đồ từ thư viện thả vào phòng, hoặc bấm đúp một phòng để zoom vào thiết kế.', { n: built.rooms.length }));
  }

  /* ---------- Thêm, xóa, đổi tên phòng ---------- */

  /** Đưa một phòng vào căn hộ tại vị trí `index` trong danh sách, kèm bố cục, lịch sử riêng và chỗ nằm trong mô hình. */
  private insertRoom(entry: RoomEntry, layout: Layout, at: { x: number; y: number; z?: number }, index: number): void {
    this.rooms = [...this.rooms.slice(0, index), entry, ...this.rooms.slice(index)];
    this.layouts[entry.id] = layout;
    this.history.add(entry.id, layout);
    this.apt = { ...this.apt, [entry.id]: at };
  }

  /** Bỏ một phòng khỏi căn hộ (danh sách, bố cục, lịch sử, vị trí). Đang chọn hoặc đang mở phòng đó thì chuyển sang phòng đầu danh sách. */
  private removeRoomEntry(id: RoomId): void {
    this.rooms = this.rooms.filter((r) => r.id !== id);
    delete this.layouts[id];
    this.history.remove(id);
    const { [id]: _gone, ...rest } = this.apt;
    this.apt = rest;
    if (this.v.aptSel === id) this.v.aptSel = null;
    if (this.room === id) this.room = this.rooms[0]!.id;
  }

  /** Thêm một phòng theo loại. at là nơi thả trong mô hình (tâm phòng); không có thì tự tìm chỗ trống cạnh các phòng khác. */
  private addRoom(type: RoomEntry['type'], at: { x: number; y: number } | null): void {
    if (this.rooms.length >= LIMITS.maxRooms) {
      this.notice(t('Căn hộ đã có {max} phòng, là mức tối đa. Hãy xóa bớt phòng trước khi thêm.', { max: LIMITS.maxRooms }));
      return;
    }
    const entry = newRoomEntry(type, this.rooms);
    const layout = freshLayout(roomDef(entry), this.registry, this.nextUid);
    // chốt vị trí các phòng đang có để chúng không tự nhảy khi có thêm phòng mới
    if (Object.keys(this.apt).length < this.rooms.length) this.apt = freezePlan(this.aptGeometry().rects, this.apt);
    const g = this.aptGeometry();
    // thả vào chỗ đã có phòng thì phòng mới nằm trên và khuyết phòng bị đè (miễn phòng đó còn đủ phần thấy); không được, hoặc bấm trong thư viện, thì tìm chỗ trống gần nhất
    const want = at ? { x: at.x - layout.W / 2, y: at.y - layout.H / 2 } : null;
    const over = want ? spotOver(g.rects, g.stack, layout.W, layout.H, want, this.v.snap) : null;
    const spot = over ?? roomSpot(g.rects, layout.W, layout.H, want, this.v.snap);
    const index = this.rooms.length;
    this.insertRoom(entry, cloneLayout(layout), spot, index);
    const z = over ? zOnTop(this.aptGeometry().rects, this.apt, entry.id) : undefined;
    if (z) this.apt = { ...this.apt, [entry.id]: { ...spot, z } };
    this.pushAptOp({ kind: 'add', entry: { ...entry }, layout, at: { ...this.apt[entry.id]! }, index });
    if (this.v.overview) {
      // phòng mới thành phòng đang chọn: có khung chọn, mục Phòng ở cột phải và là nơi nhận đồ khi bấm trong thư viện
      this.room = entry.id;
      this.deselect();
      this.v.aptSel = entry.id;
    }
    this.afterRoomsChanged();
    this.notice(
      this.v.overview
        ? z
          ? t('Đã thêm {name}, nằm trên phòng bị đè. Bấm Hoàn tác nếu thêm nhầm.', { name: tn(entry.name) })
          : t('Đã thêm {name}. Thả đồ vào phòng để bày; bấm Hoàn tác nếu thêm nhầm.', { name: tn(entry.name) })
        : t('Đã thêm {name} vào căn hộ. Bấm "Cả căn hộ" để xem.', { name: tn(entry.name) }),
    );
  }

  /** Xóa một phòng khỏi căn hộ (kèm toàn bộ bản vẽ của phòng). Hoàn tác lấy lại được. Căn hộ luôn giữ ít nhất một phòng. */
  private removeRoom(id: RoomId): void {
    const index = this.rooms.findIndex((r) => r.id === id);
    if (index < 0) return;
    if (this.rooms.length <= 1) {
      this.notice(t('Căn hộ cần có ít nhất một phòng nên không xóa phòng cuối cùng được.'));
      return;
    }
    // chốt vị trí các phòng còn lại để chúng không tự dồn chỗ khi có phòng bị xóa
    if (Object.keys(this.apt).length < this.rooms.length) this.apt = freezePlan(this.aptGeometry().rects, this.apt);
    const entry = this.rooms[index]!;
    const op: AptOp = { kind: 'remove', entry: { ...entry }, layout: cloneLayout(this.layouts[id]!), at: { ...this.apt[id]! }, index, history: this.history.snapshot(id) ?? undefined };
    this.removeRoomEntry(id);
    this.pushAptOp(op);
    this.afterRoomsChanged();
    this.notice(t('Đã xóa {name}. Bấm Hoàn tác để lấy lại.', { name: tn(entry.name) }));
  }

  /** Đổi tên phòng. Trả về tên đang dùng (giữ tên cũ nếu tên mới trống). */
  renameRoom(id: RoomId, raw: string): string {
    const entry = this.rooms.find((r) => r.id === id);
    if (!entry) return '';
    const name = cleanText(raw, MAX_ROOM_NAME);
    // ô tên đang hiện tên đã dịch của phòng chưa đặt tên riêng: không đổi gì thì không coi là đổi tên
    if (!name || name === entry.name || name === tn(entry.name)) return tn(entry.name);
    this.pushAptOp({ kind: 'rename', room: id, before: entry.name, after: name });
    this.rooms = this.rooms.map((r) => (r.id === id ? { ...r, name } : r));
    this.afterRoomsChanged();
    return name;
  }

  /** Danh sách phòng hoặc bố cục vừa đổi: ghi nhận chưa xuất, lưu, vẽ lại (mô hình thì chỉnh khung nhìn cho vừa). */
  private afterRoomsChanged(): void {
    this.touched();
    this.render({ keepView: true });
    this.updatePanels();
    this.persist();
    void this.refitApartment();
  }

  /** before: khung nhìn toàn căn trước khi áp bước Hoàn tác. Chỉ chỉnh lại khung nhìn khi cỡ căn hộ đổi (sửa một món thì giữ nguyên mức zoom đang xem). */
  private afterAptHistory(before?: Bounds): void {
    this.touched();
    this.render({ keepView: true });
    this.updatePanels();
    this.persist();
    const now = this.aptGeometry().bounds;
    if (!before || before.x !== now.x || before.y !== now.y || before.w !== now.w || before.h !== now.h) void this.refitApartment();
  }

  /** Bỏ vị trí đã chốt: các phòng tự xếp lại theo lưới. Hoàn tác được. */
  private aptAuto(): void {
    if (!Object.keys(this.apt).length) return;
    const before = freezePlan(this.aptGeometry().rects, this.apt);
    this.apt = {};
    this.pushAptOp({ kind: 'plan', before, after: {} });
    this.afterAptHistory();
  }

  /** Số rộng, dọc gõ vào ô của phòng đang chọn. Trả về cỡ đã dùng để ô nhập hiện đúng số đó. */
  setAptSize(key: 'W' | 'H', raw: string): number | null {
    const id = this.v.aptSel;
    if (!id) return null;
    const cur = this.aptGeometry().rects[id];
    const lim = ROOM_DIM_LIMITS[key];
    const v = this.readWhole(raw, lim, key === 'W' ? cur.w : cur.h, true);
    if (v === null) return null;
    const used = this.aptResize(id, key === 'W' ? v : cur.w, key === 'H' ? v : cur.h, false);
    this.aptCommit();
    return key === 'W' ? used.w : used.h;
  }

  /** Mũi tên dời phòng đang chọn (mỗi lần bấm là một bước Hoàn tác). */
  private aptNudge(dir: Dir, step: number): void {
    const id = this.v.aptSel;
    if (!id || !this.v.aptEdit) return;
    const r = this.aptGeometry().rects[id];
    const dx = dir === 'left' ? -step : dir === 'right' ? step : 0;
    const dy = dir === 'up' ? -step : dir === 'down' ? step : 0;
    this.aptMoveTo(id, r.x + dx, r.y + dy);
    this.aptCommit();
  }

  /** Điền cột phải khi có phòng đang chọn trên mô hình: tên phòng (không ghi đè ô đang gõ) và ô rộng, dọc của mục Phòng (theo cỡ vừa kéo). */
  private paintAptSel(): void {
    const { els, v } = this;
    const id = v.overview ? v.aptSel : null;
    els.aptSel.hidden = !id;
    if (!id) return;
    const l = this.layouts[id]!;
    const name = tn(this.rooms.find((r) => r.id === id)?.name ?? '');
    els.aptSelName.textContent = name;
    if (document.activeElement !== els.aptName) els.aptName.value = name;
    if (id === this.room) {
      if (document.activeElement !== els.rW) els.rW.value = String(l.W);
      if (document.activeElement !== els.rH) els.rH.value = String(l.H);
    }
  }

  select(sel: Selection | null): void {
    this.v.sel = sel;
    this.v.opening = null;
    this.render();
    this.updatePanels();
  }

  selectOpening(sel: OpeningSel | null): void {
    this.v.opening = sel;
    this.v.sel = null;
    this.render();
    this.updatePanels();
  }

  /** Bỏ chọn cả món lẫn cửa. */
  private deselect(): void {
    this.v.sel = null;
    this.v.opening = null;
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

  /** Thêm một cửa đi hoặc cửa sổ lên tường: thả ở đâu thì đặt ở đó; bấm trong thư viện thì tự tìm chỗ trống (ưu tiên tường đang xem). */
  private dropOpening(preset: OpeningPreset, at: OpeningDrop | null, into = ''): void {
    // into: tên phòng nhận món khi bấm trong thư viện lúc xem cả căn hộ (để báo đã thêm vào đâu)
    const l = this.layout();
    if (isOpeningsFull(l, preset.kind)) {
      this.notice(preset.kind === 'door' ? t('Phòng này đã có {max} cửa đi, là mức tối đa. Hãy xóa bớt trước khi thêm.', { max: LIMITS.maxOpeningsPerKind }) : t('Phòng này đã có {max} cửa sổ, là mức tối đa. Hãy xóa bớt trước khi thêm.', { max: LIMITS.maxOpeningsPerKind }));
      return;
    }
    const mode = this.v.mode;
    const prefer = mode === 'elev' ? this.v.wall : mode === '3d' ? this.scene?.farWall() : undefined;
    const spot = openingSpot(l, preset.w, at, prefer);
    const sel = addOpening(l, preset, spot.wall, spot.pos, this.v.snap, this.nextUid());
    this.v.sel = null;
    this.v.opening = sel;
    // đang xem mặt đứng thì đi theo cửa sang tường mới (nếu tường đang xem hết chỗ)
    if (mode === 'elev') this.v.wall = spot.wall;
    this.refresh(false);
    if (into && !at) this.notice(t('Đã thêm {name} vào {room}.', { name: tn(preset.name), room: into }));
  }

  drop(id: string, at: DropAt | null): void {
    // loại phòng trong thư viện: thêm một phòng vào căn hộ (thả vào mô hình thì đặt đúng chỗ thả)
    const roomType = roomTypeFromDragId(id);
    if (roomType) {
      this.addRoom(roomType, at?.kind === 'apartment' ? at : null);
      return;
    }
    let local: Exclude<DropAt, { kind: 'apartment' }> | null = at?.kind === 'apartment' ? null : at;
    let into = '';
    if (this.v.overview) {
      // xem cả căn: đồ và cửa vào đúng phòng chứa chỗ thả; bấm trong thư viện thì vào phòng đang chọn
      const rects = this.aptRects();
      const room = at?.kind === 'apartment' ? roomAtPoint(rects, at, 10, this.aptGeometry().stack) : (this.v.aptSel ?? this.room);
      if (!room || !this.hasRoom(room)) {
        this.notice(t('Hãy thả đồ vào bên trong một phòng, không thả ra hành lang giữa các phòng.'));
        return;
      }
      this.focusRoom(room);
      if (at?.kind === 'apartment') local = { kind: 'plan', x: at.x - rects[room]!.x, y: at.y - rects[room]!.y };
      into = tn(this.defOf(room).name);
    }
    const preset = this.registry.opening(id);
    if (preset) {
      this.dropOpening(preset, local, into);
      return;
    }
    const def = this.registry.resolve(id);
    if (!def || def.status !== 'live') return;
    const l = this.layout();
    const mode = this.v.mode;
    // thư viện mặt bằng chỉ có đồ sàn, mặt đứng chỉ có đồ tường; món lạc loài (kéo từ chỗ khác tới) thì bỏ qua
    if ((def.place === 'wall' && mode === 'plan') || (def.place === 'floor' && mode === 'elev')) return;
    if (isFull(l)) {
      this.notice(fullMsg());
      return;
    }
    let sel: Selection;
    if (def.place === 'wall') {
      const onWall = local?.kind === 'wall' ? local : null;
      const wall = onWall?.wall ?? (mode === 'elev' ? this.v.wall : (this.scene?.farWall() ?? 'T'));
      sel = addWallItem(l, def, wall, onWall?.s ?? null, onWall?.y ?? null, this.v.snap, this.nextUid());
    } else {
      sel = addFloorItem(l, def, local?.kind === 'plan' ? local : null, this.v.snap, this.nextUid());
    }
    this.v.sel = sel;
    this.v.opening = null;
    this.refresh(false);
    if (into && !at) this.notice(t('Đã thêm {name} vào {room}.', { name: tn(def.name), room: into }));
  }

  rotateBy(delta: number): void {
    const door = this.selDoor();
    if (door) {
      rotateDoor(door, delta > 0);
      this.refresh(false);
      return;
    }
    const sel = this.v.sel;
    const it = this.selItem();
    if (!sel || !it || sel.scope !== 'floor') return;
    if (!rotateItem(it as FloorItem, delta)) {
      this.notice(LOCKED.rotate());
      return;
    }
    this.refresh(false);
  }

  removeSelected(): void {
    if (this.v.overview && !this.v.opening && !this.v.sel) {
      // xem cả căn, không chọn món nào: nút Xóa, phím Delete là xóa phòng đang chọn (khi đang chỉnh bố cục)
      if (this.v.aptEdit && this.v.aptSel) this.removeRoom(this.v.aptSel);
      return;
    }
    const op = this.v.opening;
    if (op) {
      if (removeOpening(this.layout(), op)) {
        this.deselect();
        this.refresh(false);
      }
      return;
    }
    const sel = this.v.sel;
    if (!sel) return;
    if (!this.selItem()) {
      this.v.sel = null;
      return;
    }
    if (!removeItem(this.layout(), sel)) {
      this.notice(LOCKED.delete());
      return;
    }
    this.deselect();
    this.refresh(false);
  }

  notice(text: string): void {
    this.toast.show(text);
  }

  /* ---------- Chọn phòng, kiểu xem, tường ---------- */

  /* ---------- Cả căn hộ: zoom vào phòng, zoom ra ---------- */

  private zoomMs(): number {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ZOOM_MS;
  }

  /** Khung nhìn vừa khít của một phòng (kể cả lề) khi xem mặt bằng, theo tọa độ của riêng phòng. */
  private roomFrame(id: RoomId): Bounds {
    const layout = this.layouts[id];
    return renderPlan({ layout, R: roomGeo(this.defOf(id), layout), reg: this.registry, sel: null, dim: false }).bounds;
  }

  /** Diện tích trong nhà theo cách bố trí hiện tại: phòng cộng khoảng trống kín giữa các phòng. */
  private interior(): Interior {
    const g = this.aptGeometry();
    return interiorSpace(g.stack.map((id) => g.rects[id]!));
  }

  private aptGeometry() {
    const rooms = this.apartment();
    return apartmentRects(
      Object.fromEntries(rooms.map((r) => [r.id, { W: r.geo.W, H: r.geo.H }])) as Record<RoomId, { W: number; H: number }>,
      rooms.map((r) => r.id),
      this.apt,
      Object.fromEntries(rooms.map((r) => [r.id, r.type])),
    );
  }

  /**
   * Từ mô hình cả căn: bay vùng nhìn vào phòng đã chọn (zoom vào), rồi chuyển sang trình sửa mặt bằng của phòng đó.
   * Khung đích đúng bằng khung vừa khít của mặt bằng nên lúc chuyển hình không nhảy.
   */
  private async zoomIntoRoom(id: RoomId): Promise<void> {
    if (this.zooming || !this.v.overview) return;
    this.zooming = true;
    try {
      // đang xem 3D cả căn: về mặt bằng cả căn trước (zoom vào chỉ bay trên bản vẽ 2D)
      if (this.v.mode === '3d') {
        this.scene?.hide();
        this.v.mode = 'plan';
        this.library.setMode(this.libMode());
        this.render();
        this.updatePanels();
      }
      const target = roomViewInApartment(this.aptGeometry().rects[id], this.roomFrame(id));
      await this.stage.animateTo(target, this.zoomMs());
      this.room = id;
      this.v.overview = false;
      this.v.mode = 'plan';
      this.deselect();
      this.library.setMode(this.libMode());
      this.scene?.forgetRoom();
      this.refresh(false);
      this.kv.set(VIEW_KEY, 'room');
      // mô hình thu nhỏ đổi sang mặt bằng chi tiết: hiện dần cho đỡ chớp
      this.els.plan.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: 280, easing: 'ease-out' });
    } finally {
      this.zooming = false;
    }
  }

  /** Từ một phòng: về mô hình cả căn. Vẽ mô hình với vùng nhìn đang là phòng này rồi bay ra (zoom ra). */
  private async zoomToApartment(): Promise<void> {
    if (this.zooming || this.v.overview) return;
    this.zooming = true;
    try {
      if (this.v.mode !== 'plan') this.setMode('plan');
      const geometry = this.aptGeometry();
      const start = roomViewInApartment(geometry.rects[this.room], this.roomFrame(this.room));
      this.deselect();
      this.v.overview = true;
      // zoom ra: phòng vừa rời là phòng đang chọn trên mô hình
      this.v.aptSel = this.room;
      this.library.setMode(this.libMode());
      this.kv.set(VIEW_KEY, 'apartment');
      this.render({ startView: start });
      this.updatePanels();
      await this.stage.animateTo(geometry.bounds, this.zoomMs());
    } finally {
      this.zooming = false;
    }
  }

  setRoom(id: RoomId): void {
    if (this.zooming || !this.hasRoom(id)) return;
    if (id === this.room) return;
    this.room = id;
    this.deselect();
    this.scene?.forgetRoom();
    this.refresh(false);
  }

  /** Kiểu danh sách của thư viện theo màn hình đang xem. */
  private libMode(): LibMode {
    return this.v.overview ? (this.v.mode === '3d' ? 'apartment3d' : 'apartment') : this.v.mode;
  }

  setMode(mode: Mode): void {
    if (mode === this.v.mode) return;
    // mô hình cả căn chỉ có mặt bằng và 3D: mặt đứng là của từng tường trong một phòng
    if (this.v.overview && mode === 'elev') return;
    if (mode !== '3d') {
      this.scene?.hide();
    } else {
      // vào 3D thì luôn nhìn lại từ góc chéo
      this.scene?.forgetRoom();
    }
    this.v.mode = mode;
    this.deselect();
    this.library.setMode(this.libMode());
    this.refresh(false);
  }

  setWall(wall: WallKey): void {
    this.v.wall = wall;
    this.deselect();
    this.refresh(false);
  }

  /* ---------- Hoàn tác, bố trí mẫu, xóa ---------- */

  undo(): void {
    if (this.v.overview) {
      this.aptUndo();
      return;
    }
    const snap = this.history.undo(this.room);
    if (snap) this.applySnapshot(snap);
  }

  redo(): void {
    if (this.v.overview) {
      this.aptRedo();
      return;
    }
    const snap = this.history.redo(this.room);
    if (snap) this.applySnapshot(snap);
  }

  private applySnapshot(snap: Layout): void {
    this.layouts[this.room] = snap;
    this.dropOpsFor(this.room);
    this.deselect();
    this.render();
    this.updatePanels();
    this.touched();
    this.persist();
  }

  reset(): void {
    const { mode, wall } = this.v;
    const fresh = freshLayout(this.defOf(this.room), this.registry, this.nextUid);
    resetTo(this.layout(), fresh, mode === 'elev' ? wall : mode === '3d' ? 'all' : 'plan');
    this.deselect();
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
    this.deselect();
    this.refresh(false);
    if (kept > 0) this.notice(removed > 0 ? t('Đã xóa {n} món. {kept} món đã khóa được giữ lại.', { n: removed, kept }) : t('Các món ở đây đều đã khóa nên không xóa. Mở khóa từng món nếu muốn xóa.'));
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
    // trên mô hình cả căn, đổi rộng hoặc dọc phải tránh chồng phòng khác: dùng đường đổi cỡ của mô hình (áp dụng khi rời ô)
    if (this.v.overview && key !== 'ceil') return final ? this.setAptSize(key, raw) : null;
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
      this.notice(key === 'y' ? LOCKED.move() : LOCKED.resize());
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
      this.notice(LOCKED.rotate());
      return null;
    }
    this.commitEdit(final);
    this.changing();
    return (it as FloorItem).rot;
  }

  /** Cửa đi hoặc cửa sổ đang chọn, kèm khoảng cho phép của vị trí và chiều rộng. */
  private openingModel(): OpeningModel | null {
    const l = this.layout();
    const sel = this.v.opening;
    const item = findOpening(l, sel);
    return sel && item ? { kind: sel.kind, item, ranges: openingRanges(l, item) } : null;
  }

  setOpening(field: 'pos' | 'w', raw: string, final: boolean): number | null {
    const l = this.layout();
    const o = findOpening(l, this.v.opening);
    if (!o) return null;
    const v = this.readWhole(raw, openingRanges(l, o)[field], o[field], final);
    if (v === null) return null;
    if (v === o[field]) return v;
    if (field === 'pos') moveOpening(l, o, o.wall, v, false);
    else setOpeningWidth(l, o, v);
    this.commitEdit(final);
    return o[field];
  }

  /** Cửa đi đang chọn (cửa sổ không có cánh xoay). */
  private selDoor(): DoorItem | undefined {
    const sel = this.v.opening;
    return sel?.kind === 'door' ? (findOpening(this.layout(), sel) as DoorItem | undefined) : undefined;
  }

  flipDoorHinge(): void {
    const door = this.selDoor();
    if (!door) return;
    flipHinge(door);
    this.refresh(false);
  }

  toggleDoorSwing(): void {
    const door = this.selDoor();
    if (!door) return;
    toggleSwing(door);
    this.refresh(false);
  }

  setOpeningWall(wall: WallKey): void {
    const l = this.layout();
    const o = findOpening(l, this.v.opening);
    if (!o || o.wall === wall) return;
    // pos mỗi tường tính từ một góc khác nhau nên không giữ số cũ: đặt cửa giữa tường mới, rồi người dùng chỉnh tiếp
    moveOpening(l, o, wall, (wallLength(l, wall) - o.w) / 2, true);
    // đang xem mặt đứng thì đi theo cửa sang tường mới, không thì cửa biến mất khỏi khung hình
    if (this.v.mode === 'elev') this.v.wall = wall;
    this.refresh(false);
  }

  toggleRail(wall: WallKey): void {
    toggleRailOp(this.layout(), wall);
    this.refresh(false);
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
      this.notice(fullMsg());
      return;
    }
    const copy = duplicateItem(l, sel, this.nextUid);
    if (!copy) return;
    this.v.sel = copy;
    this.v.opening = null;
    this.refresh(false);
  }

  /** Ctrl+C: nhớ món đang chọn để dán. */
  copySelected(): void {
    const sel = this.v.sel;
    const c = sel ? copyItem(this.layout(), sel) : null;
    if (!c) return;
    this.clip = c;
    this.pasteN = 0;
    this.notice(t('Đã sao chép {name}. Bấm Ctrl+V để dán.', { name: tn(c.item.name) }));
  }

  /** Ctrl+V: dán món đã sao chép vào phòng đang xem (xem cả căn hộ thì vào phòng đang chọn), lệch một chút so với bản trước. */
  paste(): void {
    const clip = this.clip;
    const { v } = this;
    if (!clip) {
      this.notice(t('Chưa sao chép món nào. Chọn một món rồi bấm Ctrl+C.'));
      return;
    }
    if (v.overview && v.mode === '3d') return;
    if (clip.scope !== 'floor' && v.mode === 'plan') {
      this.notice(t('Đồ gắn tường chỉ dán được ở Mặt đứng hoặc 3D của phòng.'));
      return;
    }
    if (clip.scope === 'floor' && v.mode === 'elev') {
      this.notice(t('Đồ đặt sàn chỉ dán được ở Mặt bằng hoặc 3D.'));
      return;
    }
    if (v.overview) {
      const room = v.aptSel ?? this.room;
      if (!this.hasRoom(room)) return;
      this.focusRoom(room);
    }
    const l = this.layout();
    if (isFull(l)) {
      this.notice(fullMsg());
      return;
    }
    const sel = pasteItem(l, clip, this.nextUid, ++this.pasteN);
    if (!sel) return;
    v.sel = sel;
    v.opening = null;
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
    this.els.penBox.dataset.on = String(penShown(!!this.v.sel, this.v.pen));
  }

  /* ---------- Nhập, xuất, nhắc sao lưu ---------- */

  private applyImport(rooms: ImportedRoom[], file: ParsedFile): void {
    let added = 0;
    let skipped = 0;
    for (const r of rooms) {
      const layout = layoutFromImported(r, this.nextUid);
      if (this.hasRoom(r.id)) {
        this.layouts[r.id] = layout;
        // mỗi phòng nhập vào là một bước Hoàn tác riêng của phòng đó
        this.history.commit(r.id, layout, false);
      } else if (this.rooms.length < LIMITS.maxRooms) {
        // phòng chưa có trong căn hộ: thêm vào, ở chỗ file ghi hoặc chỗ trống gần nhất
        if (Object.keys(this.apt).length < this.rooms.length) this.apt = freezePlan(this.aptGeometry().rects, this.apt);
        const spot = file.apt[r.id] ?? roomSpot(this.aptGeometry().rects, layout.W, layout.H, null, this.v.snap);
        this.insertRoom({ ...r.entry }, layout, spot, this.rooms.length);
        added++;
      } else {
        skipped++;
      }
    }
    // file ghi vị trí các phòng trong căn thì lấy theo (cho những phòng vừa nhập); các bước Hoàn tác bố cục cũ không còn đúng nữa
    for (const r of rooms) {
      const at = file.apt[r.id];
      if (at && this.hasRoom(r.id)) this.apt = { ...this.apt, [r.id]: at };
    }
    this.aptOps = [];
    this.aptRedoOps = [];
    const first = rooms.find((r) => this.hasRoom(r.id));
    if (!this.hasRoom(this.room) || (first && !rooms.some((r) => r.id === this.room))) this.room = first?.id ?? this.rooms[0]!.id;
    if (file.name || file.note) this.meta = { name: file.name, note: file.note };
    this.deselect();
    // phòng hiện tại có thể đã đổi: bỏ chọn phòng trên mô hình để mục Phòng không lệch sang phòng khác
    if (this.v.overview) this.v.aptSel = null;
    this.scene?.forgetRoom();
    this.touched();
    this.refresh(false);
    this.notice(
      [
        t('Đã nhập {n} phòng từ file', { n: rooms.length - skipped }),
        added ? t(', thêm {n} phòng mới vào căn hộ', { n: added }) : '',
        skipped ? t('; bỏ {n} phòng vì căn hộ đã đủ {max} phòng', { n: skipped, max: LIMITS.maxRooms }) : '',
        t('. Nhập nhầm thì bấm Hoàn tác ở từng phòng.'),
      ].join(''),
    );
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
  private render(opts: { startView?: Bounds; keepView?: boolean } = {}): void {
    const { els, v } = this;
    const l = this.layout();
    if (v.sel && !findItem(l, v.sel)) v.sel = null;
    if (v.opening && !findOpening(l, v.opening)) v.opening = null;
    const is3d = v.mode === '3d';
    els.plan.toggleAttribute('hidden', is3d);
    els.view3d.hidden = !is3d;
    els.legend.hidden = is3d;
    els.zoombar.hidden = is3d;
    if (is3d) {
      this.render3d();
      return;
    }
    this.scene?.hide();
    this.showInfo(this.stage.render(opts));
  }

  private render3d(): void {
    if (!this.scene && !this.sceneLoading && !this.sceneFailed) this.ensureScene();
    const s = this.scene;
    s?.show();
    const info = this.v.overview ? describeApartment3D(this.apartment(), !!s?.failed, this.interior()) : describe3D(this.layout(), this.geo(), this.registry, !!s?.failed);
    if (!s && !this.sceneFailed) info.status = { tone: 'good', text: t('Đang tải khung 3D...') };
    else if (!s) info.status = { tone: 'good', text: t('Không tải được phần 3D. Hãy kiểm tra kết nối mạng rồi tải lại trang. Mặt bằng và mặt đứng vẫn dùng bình thường.') };
    this.showInfo(info);
  }

  /** Đã đổi ngôn ngữ: vẽ lại mọi thứ do code sinh ra (thư viện, tab, bảng bên phải, bản vẽ, ô màu); phần HTML viết sẵn đã được dịch trước đó. */
  languageChanged(): void {
    const { els } = this;
    els.floorSw.innerHTML = swatchesHtml('floor', FLOOR_COLORS);
    els.wallSw.innerHTML = swatchesHtml('wall', WALL_COLORS);
    els.itemSw.innerHTML = swatchesHtml('item', ITEM_COLORS);
    els.walls.innerHTML = wallTabsHtml(this.v.wall);
    els.opWalls.innerHTML = wallTabsHtml(this.v.wall);
    delete els.rooms.dataset.html;
    this.library.render();
    this.render();
    this.updatePanels();
    this.updateRemind();
    this.newDlg.languageChanged();
    this.tips.paint();
  }

  /** Đã đổi giao diện sáng, tối. Mặt bằng và mặt đứng tự đổi màu theo biến CSS; riêng cảnh 3D phải lấy lại màu. */
  themeChanged(): void {
    this.scene?.themeChanged();
  }

  private ensureScene(): void {
    this.sceneLoading = true;
    this.loadSceneModule()
      .then(({ Scene3D }) => {
        this.scene = new Scene3D(this.els.view3d, this);
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
    updateProps(els, { layout: this.layout(), mode: v.mode, sel, opening: this.openingModel() });
    this.updatePenUi();

    const press = (box: HTMLElement, attr: 'room' | 'mode' | 'wall', current: string): void => {
      for (const b of box.querySelectorAll<HTMLElement>(`[data-${attr}]`)) b.setAttribute('aria-pressed', String(b.dataset[attr] === current));
    };
    const ov = v.overview;
    this.renderRoomTabs();
    press(els.rooms, 'room', ov ? '' : this.room);
    press(els.modes, 'mode', v.mode);
    press(els.walls, 'wall', v.wall);
    els.wallsRow.hidden = v.mode !== 'elev' || ov;
    const is3d = v.mode === '3d';
    const elev = v.mode === 'elev';
    // xem cả căn hộ: có Mặt bằng (sửa đồ ngay trên mô hình) và 3D (chỉ xem), không có Mặt đứng; cột trái thêm danh sách phòng, cột phải thêm số liệu tổng
    els.editor.dataset.view = ov ? 'overview' : 'room';
    els.modes.querySelector('[data-mode="elev"]')?.toggleAttribute('hidden', ov);
    els.propsRoom.hidden = ov && is3d;
    // mục Phòng (cỡ, màu sàn, màu tường) là của phòng đang chọn: trên mô hình chỉ hiện khi đã chọn một phòng
    els.roomSec.hidden = ov && !v.aptSel;
    els.roomHead.textContent = ov ? t('Phòng: {name}', { name: tn(this.defOf(this.room).name) }) : t('Phòng');
    for (const el of [els.aptList, els.aptInfo]) el.hidden = !ov;
    els.btnApt.hidden = ov;
    // điện thoại: thanh nút nhanh. Xem 3D cả căn hộ thì chỉ thêm phòng được
    els.mAdd.textContent = ov && is3d ? t('＋ Thêm phòng') : t('＋ Thêm đồ');
    els.v3hint.textContent = ov ? v3HintApt() : v3HintRoom();
    if (ov && !sel && !this.openingModel()) els.mDel.disabled = !(v.aptEdit && v.aptSel);
    for (const el of [els.btnAptEdit, els.btnAptAuto]) el.hidden = !ov || is3d;
    els.btnAptEdit.setAttribute('aria-checked', String(v.aptEdit));
    els.btnAptAuto.disabled = !Object.keys(this.apt).length;
    // Bố trí mẫu, Xóa hết trên mô hình là của phòng đang chọn
    els.btnReset.disabled = els.btnClear.disabled = ov && !v.aptSel;
    if (ov) {
      const rooms = this.apartment();
      const g = this.aptGeometry();
      els.aptList.innerHTML = aptListHtml(rooms, roomAreas(g.rects, g.stack));
      els.aptSummary.innerHTML = aptInfoHtml(rooms, this.interior());
      this.paintAptSel();
    }
    revealActive(els.rooms);
    revealActive(els.walls);
    els.mini.innerHTML = miniMapHtml(v.wall);

    els.btnDim.disabled = is3d;
    els.btnDetail.disabled = is3d;
    els.btnReset.textContent = elev ? t('Mẫu tường này') : t('Bố trí mẫu');
    els.btnReset.title = elev ? t('Đặt tường đang xem về bố trí mẫu. Có thể Hoàn tác.') : ov ? t('Đặt đồ, cửa, kích thước và màu của phòng đang chọn về bố trí mẫu. Có thể Hoàn tác.') : t('Đặt đồ, cửa, kích thước và màu của phòng về bố trí mẫu. Có thể Hoàn tác.');
    els.btnClear.textContent = elev ? t('Xóa tường này') : is3d ? t('Xóa cả phòng') : t('Xóa đồ sàn');
    els.btnClear.title = elev
      ? t('Xóa mọi món trên tường đang xem. Món đã khóa được giữ lại. Có thể Hoàn tác.')
      : is3d
        ? t('Xóa mọi món của phòng, cả đồ sàn và đồ gắn tường. Món đã khóa được giữ lại. Có thể Hoàn tác.')
        : ov
          ? t('Xóa mọi món đặt trên sàn của phòng đang chọn, đồ gắn tường giữ nguyên. Món đã khóa được giữ lại. Có thể Hoàn tác.')
          : t('Xóa mọi món đặt trên sàn, đồ gắn tường giữ nguyên. Món đã khóa được giữ lại. Có thể Hoàn tác.');
    this.updateHistoryButtons();
    this.updateGuides();
  }

  /** Màn hình trống (chưa có món nào trong phạm vi đang xem): hiện thẻ hướng dẫn ba bước; và gợi ý nhanh hợp với màn hình, mỗi gợi ý một lần. */
  private updateGuides(): void {
    const { els, v } = this;
    const is3d = v.mode === '3d';
    const items = v.overview ? this.rooms.reduce((n, r) => n + countItems(this.layouts[r.id]!), 0) : countItems(this.layout());
    els.emptyState.hidden = items > 0 || is3d;
    els.emptyTitle.textContent = v.overview ? t('Căn hộ chưa có đồ nội thất') : t('Phòng này chưa có đồ nội thất');
    this.tips.update({ overview: v.overview, mode: v.mode, hasItems: items > 0, blocked: !!document.querySelector('dialog[open]') });
  }

  /** Dựng lại hàng tab phòng khi danh sách phòng, tên phòng hoặc chế độ xem đổi. */
  private renderRoomTabs(): void {
    const html = roomTabsHtml(this.rooms, this.room, this.v.overview);
    if (this.els.rooms.dataset.html === html) return;
    this.els.rooms.innerHTML = html;
    this.els.rooms.dataset.html = html;
  }

  private updateHistoryButtons(): void {
    // xem cả căn hộ thì Hoàn tác, Làm lại là của bố cục căn hộ (dời phòng, đổi cỡ phòng)
    const ov = this.v.overview;
    this.els.btnUndo.disabled = ov ? !this.aptOps.length : !this.history.canUndo(this.room);
    this.els.btnRedo.disabled = ov ? !this.aptRedoOps.length : !this.history.canRedo(this.room);
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
    // kéo đồ sang phòng khác: phòng nguồn và phòng đích cùng ghi một bước lịch sử
    const rooms = [...new Set([...this.xfer, this.room])];
    this.xfer.clear();
    const stepped: RoomId[] = [];
    for (const room of rooms) {
      if (!this.history.commit(room, this.layouts[room]!, continuous && rooms.length === 1)) continue;
      this.touched();
      if (this.history.lastWasNewStep) stepped.push(room);
      // sửa trong phòng thì lịch sử của phòng đổi ngoài danh sách Hoàn tác của mô hình: các bước của mô hình trỏ tới phòng này không còn lùi đúng được
      if (!this.v.overview) this.dropOpsFor(room);
    }
    // xem cả căn: Hoàn tác đi theo một danh sách chung, nên mỗi bước sửa bản vẽ phòng cũng là một bước trong danh sách đó
    if (this.v.overview && stepped.length) this.pushAptOp(stepped.length === 1 ? { kind: 'room', room: stepped[0]! } : { kind: 'rooms', rooms: stepped });
    this.persist();
  }

  /**
   * Bỏ khỏi danh sách Hoàn tác và Làm lại của mô hình mọi bước dùng lịch sử riêng của `room` (sửa bản vẽ, đổi cỡ, kéo đồ sang phòng khác):
   * lịch sử của phòng vừa đổi bên ngoài danh sách đó nên các bước này sẽ lùi nhầm bước nếu để lại.
   */
  private dropOpsFor(room: RoomId): void {
    const stale = (o: AptOp): boolean => (o.kind === 'room' && o.room === room) || (o.kind === 'rooms' && o.rooms.includes(room)) || (o.kind === 'plan' && !!o.rooms?.includes(room));
    this.aptOps = this.aptOps.filter((o) => !stale(o));
    this.aptRedoOps = this.aptRedoOps.filter((o) => !stale(o));
  }

  private persist(): void {
    const ok = saveState(this.kv, this.room, this.layouts, this.penPrefs, this.meta, this.apt, this.rooms);
    if (!ok && !this.warnedSave) {
      this.warnedSave = true;
      this.notice(t('Trình duyệt không cho lưu tự động (có thể đang ở chế độ riêng tư). Hãy bấm Xuất file để giữ bản vẽ.'));
    }
    this.updateHistoryButtons();
    this.updateRemind();
  }

  /* ---------- Giao diện: thanh công cụ, phím tắt ---------- */

  private bindToolbar(): void {
    const { els } = this;
    const pick = (e: Event, attr: string): string | undefined => (e.target as Element).closest<HTMLElement>(`[data-${attr}]`)?.dataset[attr];
    els.rooms.addEventListener('click', (e) => {
      if (pick(e, 'apt') && !this.v.overview) {
        void this.zoomToApartment();
        return;
      }
      const id = pick(e, 'room');
      if (!this.hasRoom(id)) return;
      // đang xem cả căn thì zoom vào phòng; đang ở một phòng thì chuyển thẳng sang phòng kia
      if (this.v.overview) void this.zoomIntoRoom(id);
      else this.setRoom(id);
    });
    els.btnNew.addEventListener('click', () => this.newDlg.open());
    els.emptyNew.addEventListener('click', () => this.newDlg.open());
    // gợi ý nhanh nhường chỗ cho hộp thoại; đóng xong thì xét lại
    for (const dlg of [els.dlgNew, els.dlgExport, els.dlgImport]) dlg.addEventListener('close', () => this.updateGuides());
    els.emptyAdd.addEventListener('click', () => {
      if (this.mobile.isMobile) this.mobile.setLib(true);
      else this.library.revealFirst();
    });
    els.btnApt.addEventListener('click', () => void this.zoomToApartment());
    els.btnAptEdit.addEventListener('click', () => {
      this.v.aptEdit = !this.v.aptEdit;
      // đang chỉnh bố cục thì đồ không chọn được: bỏ chọn đồ (phòng đang chọn vẫn giữ)
      this.deselect();
      this.render({ keepView: true });
      this.updatePanels();
    });
    els.btnAptAuto.addEventListener('click', () => this.aptAuto());
    els.aptEnter.addEventListener('click', () => {
      if (this.v.aptSel) void this.zoomIntoRoom(this.v.aptSel);
    });
    els.aptDel.addEventListener('click', () => {
      if (this.v.aptSel) this.removeRoom(this.v.aptSel);
    });
    els.aptName.addEventListener('change', () => {
      if (this.v.aptSel) els.aptName.value = this.renameRoom(this.v.aptSel, els.aptName.value);
    });
    els.aptList.addEventListener('click', (e) => {
      const id = pick(e, 'room');
      if (this.hasRoom(id)) void this.zoomIntoRoom(id);
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
    els.btnDetail.addEventListener('click', () => {
      this.v.detail = !this.v.detail;
      els.btnDetail.setAttribute('aria-checked', String(this.v.detail));
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

    els.btnIso.addEventListener('click', () => this.scene?.viewIso());
    els.btnTop.addEventListener('click', () => this.scene?.viewTop());
    els.btnZi.addEventListener('click', () => this.scene?.zoom(0.8));
    els.btnZo.addEventListener('click', () => this.scene?.zoom(1.25));
    els.btnFull.addEventListener('click', () => {
      this.full.toggle();
      // vào toàn màn hình khi đang xem 3D: đưa focus vào khung 3D để mũi tên xoay camera ngay
      if (this.full.on && this.v.mode === '3d') els.view3d.focus();
    });
  }

  private keyContext(): KeyContext {
    return { mode: this.v.mode, hasSel: !!this.selItem(), selFloor: this.v.sel?.scope === 'floor', selOpening: !!findOpening(this.layout(), this.v.opening), selDoor: !!this.selDoor(), selRoom: this.v.overview && this.v.aptEdit && !!this.v.aptSel };
  }

  private runKey(a: KeyAction): void {
    if (this.zooming && a.type !== 'escape') return;
    const itemSel = !!this.selItem() || !!findOpening(this.layout(), this.v.opening);
    if (this.v.overview && !itemSel && a.type !== 'escape' && a.type !== 'undo' && a.type !== 'redo' && a.type !== 'paste') {
      // xem cả căn hộ, chưa chọn món hay cửa nào: mũi tên dời phòng đang chọn (10 cm, giữ Shift: 50 cm), Delete xóa phòng đang chọn
      if (a.type === 'nudge') this.aptNudge(a.dir, a.step * 2);
      else if (a.type === 'remove' && this.v.aptEdit && this.v.aptSel) this.removeRoom(this.v.aptSel);
      return;
    }
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
      case 'duplicate':
        this.duplicate();
        break;
      case 'copy':
        this.copySelected();
        break;
      case 'paste':
        this.paste();
        break;
      case 'rotate':
        this.rotateBy(a.delta);
        break;
      case 'nudge':
        this.nudgeSelected(a.dir, a.step);
        break;
      case 'escape':
        if (this.v.overview && (this.v.sel || this.v.opening)) this.select(null);
        else if (this.v.overview && this.v.aptSel) this.aptSelect(null);
        else if (this.full.on) this.full.set(false);
        else if (this.mobile.libOpen) this.mobile.setLib(false);
        else if (this.v.pen) this.setTool(null);
        break;
    }
  }

  private nudgeSelected(dir: Dir, step: number): void {
    const l = this.layout();
    const op = findOpening(l, this.v.opening);
    if (op) {
      const delta = openingStep(this.v.mode === 'elev' ? 'elev' : 'plan', op.wall, dir, step);
      if (delta !== 0 && moveOpening(l, op, op.wall, op.pos + delta, false)) {
        this.refresh(true);
        this.stage.focusSelected();
      }
      return;
    }
    const sel = this.v.sel;
    const it = this.selItem();
    if (!sel || !it) return;
    if (!canEdit(it, 'move')) {
      this.notice(LOCKED.move());
      return;
    }
    if (nudge(this.layout(), sel.scope, it, dir, step)) {
      this.refresh(true);
      this.stage.focusSelected();
    }
  }
}
