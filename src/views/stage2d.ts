import { canEdit, findItem, findOpening } from '../core/layout';
import { openRange, wallLength } from '../core/geometry';
import { moveOpening } from '../core/ops';
import type { FloorItem, OpeningKind, OpeningSel, Selection, WallItem } from '../core/types';
import { dragOpeningWall, dragWall, grabOpeningWall, grabWall, renderElevation } from './elevation';
import type { Frame } from './frame';
import type { DropAt, Host, PenTarget } from './host';
import { dragOpeningPlan, dragPlan, grabOpeningPlan, grabPlan, renderPlan, rotationAt, type Grab } from './plan';
import { renderApartment, roomAtPoint, type AptRect } from './apartment';
import { easeInOut, lerpView, parseView, unitsPerPixel, viewToString, Viewport, type Bounds } from './viewport';
import type { RoomId } from '../data/rooms';
import { t } from '../i18n';

/** Con trỏ di chuyển ít hơn mức này (px) thì coi là bấm chứ không phải kéo. */
const CLICK_SLOP = 4;
/** Hai lần bấm trống trên một phòng cách nhau không quá bấy nhiêu mili giây thì là bấm đúp. */
const DOUBLE_TAP_MS = 450;
/** Hệ số mỗi nấc cuộn chuột khi giữ Ctrl. */
const WHEEL_STEP = 0.0015;
/** Hệ số mỗi lần bấm nút + hoặc −. */
export const ZOOM_STEP = 1.4;

type Drag =
  /** over: phòng nằm trên cùng dưới con trỏ lần trước (mô hình cả căn), để chỉ chuyển đồ sang phòng khác khi con trỏ vừa đi vào phòng đó. */
  | { kind: 'item'; sel: Selection; grab: Grab; moved: boolean; over: RoomId | null }
  | { kind: 'locked'; sel: Selection; x: number; y: number; told: boolean }
  | { kind: 'rot'; sel: Selection; moved: boolean }
  /** Kéo cửa đi hoặc cửa sổ. grab: con trỏ cách mép gần góc của cửa bao nhiêu cm dọc theo tường. */
  | { kind: 'op'; sel: OpeningSel; grab: number; moved: boolean }
  /** room: phòng bị nhấn trên mô hình cả căn (bấm không kéo thì chọn phòng đó). */
  | { kind: 'empty'; x: number; y: number; moved: boolean; room: RoomId | null };

/**
 * Khung vẽ 2D dùng chung cho mặt bằng và mặt đứng: vẽ lại, kéo món, xoay, phóng to và kéo bản vẽ, thả món từ thư viện.
 * Phần tính toán nằm ở plan.ts và elevation.ts (hàm thuần); ở đây chỉ nối chúng với con trỏ và DOM.
 */
export class Stage2D {
  readonly viewport = new Viewport();
  /** Gọi khi mức phóng to đổi, để cập nhật nút + và −. */
  onZoomChange: () => void = () => {};

  private lastKey = '';
  private drag: Drag | null = null;
  /** Đang bay vùng nhìn (zoom vào hoặc ra): bỏ qua thao tác chuột, bàn phím. */
  private flying = false;
  /**
   * Gốc của hệ tọa độ đang dùng để sửa đồ: (0, 0) khi xem một phòng; trên mô hình cả căn là góc trên trái của phòng đang thao tác,
   * nhờ đó các hàm kéo, xoay, đặt đồ của plan.ts chạy nguyên như khi xem một phòng.
   */
  private origin = { x: 0, y: 0 };
  /** Lần bấm trống gần nhất trên một phòng của mô hình, để nhận ra bấm đúp (vẽ lại giữa hai lần bấm làm trình duyệt không gửi sự kiện dblclick). */
  private lastTap: { room: RoomId; t: number; x: number; y: number } | null = null;
  /** Chỉnh bố cục căn hộ: đang kéo phòng (move) hoặc tay nắm đổi cỡ (resize). start là điểm nhấn theo tọa độ căn hộ, rect là phòng lúc bắt đầu. */
  private aptDrag: { kind: 'move' | 'resize'; room: RoomId; handle: string; start: { x: number; y: number }; client: { x: number; y: number }; rect: AptRect; moved: boolean } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; cx: number; cy: number } | null = null;
  private readonly off: (() => void)[] = [];

  constructor(
    private readonly svg: SVGSVGElement,
    private readonly host: Host,
  ) {
    this.listen(svg, 'pointerdown', (e) => this.down(e));
    this.listen(svg, 'pointermove', (e) => this.move(e));
    this.listen(svg, 'pointerup', (e) => this.up(e));
    this.listen(svg, 'pointercancel', (e) => this.up(e));
    this.listen(svg, 'wheel', (e) => this.wheel(e), { passive: false });
    this.listen(svg, 'keydown', (e) => this.aptKey(e));
    this.listen(svg, 'dblclick', (e) => {
      // bấm đúp vào phòng (không phải vào đồ hay cửa) thì zoom vào phòng đó
      const room = this.host.view().overview && !this.flying && !this.itemAt(e) && !this.openingAt(e) ? this.roomAt(e) : null;
      if (room) this.host.openRoom(room);
    });
    this.listen(svg, 'dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    this.listen(svg, 'drop', (e) => this.dropped(e));
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off.length = 0;
  }

  private listen<K extends keyof SVGElementEventMap>(el: SVGSVGElement, type: K, fn: (e: SVGElementEventMap[K]) => void, opts?: AddEventListenerOptions): void {
    el.addEventListener(type, fn as EventListener, opts);
    this.off.push(() => el.removeEventListener(type, fn as EventListener, opts));
  }

  /* ---------- Vẽ ---------- */

  /** startView: vùng nhìn lúc bắt đầu thay cho vùng nhìn vừa khung (dùng khi zoom ra từ một phòng, để animateTo bay tiếp từ đó). */
  render(opts: { startView?: Bounds; keepView?: boolean } = {}): Frame {
    const v = this.host.view();
    const layout = this.host.layout();
    const R = this.host.geo();
    const reg = this.host.registry;
    const frame = v.overview
      ? renderApartment(this.host.apartment(), {
          plan: this.host.aptPlan(),
          edit: v.aptEdit,
          selected: v.aptSel,
          items: { reg, room: R.id, sel: v.sel, opening: v.opening, dim: v.dim, detail: v.detail },
        })
      : v.mode === 'elev'
        ? renderElevation({ layout, R, reg, wall: v.wall, sel: v.sel, opening: v.opening, dim: v.dim, detail: v.detail })
        : renderPlan({ layout, R, reg, sel: v.sel, opening: v.opening, dim: v.dim, detail: v.detail });
    // đổi phòng, đổi kiểu xem hoặc đổi tường thì nhìn lại toàn bộ; chỉ đổi kích thước thì giữ mức phóng to
    const key = v.overview ? 'apartment' : `${R.id}:${v.mode}:${v.mode === 'elev' ? v.wall : ''}`;
    this.viewport.setBase(frame.bounds);
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.viewport.fit();
      this.onZoomChange();
    }
    // keepView: đang kéo phòng thì giữ nguyên khung nhìn, đừng co giãn theo cỡ căn hộ đang đổi (hình sẽ trôi dưới tay)
    if (!opts.keepView) this.svg.setAttribute('viewBox', opts.startView ? viewToString(opts.startView) : this.viewport.toString());
    this.svg.classList.toggle('aptedit', v.overview && v.aptEdit);
    this.svg.setAttribute('aria-label', frame.aria);
    this.svg.innerHTML = frame.svg;
    return frame;
  }

  /** Đưa focus về món đang chọn, vì vẽ lại làm mất focus (dùng sau khi di chuyển bằng phím mũi tên). */
  focusSelected(): void {
    const { sel, opening } = this.host.view();
    const target = opening ? `.op[data-kind="${opening.kind}"][data-uid="${opening.uid}"]` : sel ? `.it[data-uid="${sel.uid}"]` : null;
    if (target) this.svg.querySelector<SVGGElement>(target)?.focus();
  }

  /* ---------- Bay vùng nhìn (zoom vào, zoom ra) ---------- */

  get isFlying(): boolean {
    return this.flying;
  }

  /**
   * Bay vùng nhìn từ chỗ đang hiện tới `to` trong `ms` mili giây (zoom vào hoặc ra êm, xem lerpView). ms = 0 thì nhảy thẳng tới.
   * Trong lúc bay, chuột và bàn phím trên bản vẽ bị bỏ qua. Xong thì vùng nhìn đúng bằng `to`.
   */
  animateTo(to: Bounds, ms: number): Promise<void> {
    const from = parseView(this.svg.getAttribute('viewBox'));
    if (!from || ms <= 0 || typeof requestAnimationFrame !== 'function') {
      this.svg.setAttribute('viewBox', viewToString(to));
      return Promise.resolve();
    }
    this.flying = true;
    this.svg.classList.add('flying');
    return new Promise((resolve) => {
      const t0 = performance.now();
      const step = (now: number): void => {
        const k = Math.min(1, (now - t0) / ms);
        this.svg.setAttribute('viewBox', viewToString(k >= 1 ? to : lerpView(from, to, easeInOut(k))));
        if (k < 1) {
          requestAnimationFrame(step);
          return;
        }
        this.flying = false;
        this.svg.classList.remove('flying');
        resolve();
      };
      requestAnimationFrame(step);
    });
  }

  /* ---------- Mô hình căn hộ: chọn phòng ---------- */

  private roomAt(e: Event): RoomId | null {
    // .aptghost: lớp bóng của phần phòng bị phòng khác che, vẫn là phòng của nó
    const id = (e.target as Element | null)?.closest?.('.aptroom, .aptghost')?.getAttribute('data-room');
    return id && this.host.apartment().some((r) => r.id === id) ? id : null;
  }

  /** Enter hoặc Space trên một phòng được focus thì zoom vào phòng đó. Đồ và cửa trong phòng có phím riêng nên bỏ qua. */
  private aptKey(e: KeyboardEvent): void {
    if (!this.host.view().overview || this.flying) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (this.itemAt(e) || this.openingAt(e)) return;
    const room = this.roomAt(e);
    if (!room) return;
    e.preventDefault();
    this.host.openRoom(room);
  }

  /* ---------- Chỉnh bố cục căn hộ: kéo phòng, đổi cỡ phòng ---------- */

  /** Nhấn chuột khi chỉnh bố cục: tay nắm thì bắt đầu đổi cỡ, thân phòng thì chọn và bắt đầu dời. Trả về false nếu nhấn ra ngoài mọi phòng. */
  private aptEditDown(e: PointerEvent): boolean {
    const room = this.roomAt(e);
    if (!room) {
      this.host.aptSelect(null);
      return false;
    }
    const handle = (e.target as Element | null)?.closest?.('.apthandle')?.getAttribute('data-handle') ?? '';
    const rect = this.host.aptRects()[room];
    const start = this.toRaw(e);
    try {
      this.svg.setPointerCapture(e.pointerId);
    } catch {
      /* vẫn dùng được */
    }
    if (this.host.view().aptSel !== room) this.host.aptSelect(room);
    this.aptDrag = { kind: handle ? 'resize' : 'move', room, handle, start, client: { x: e.clientX, y: e.clientY }, rect, moved: false };
    return true;
  }

  private aptEditMove(e: PointerEvent): void {
    const d = this.aptDrag;
    if (!d || !this.host.view().aptEdit) return;
    if (!d.moved && Math.hypot(e.clientX - d.client.x, e.clientY - d.client.y) < CLICK_SLOP) return;
    d.moved = true;
    const p = this.toRaw(e);
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    if (d.kind === 'move') {
      this.host.aptMoveTo(d.room, d.rect.x + dx, d.rect.y + dy);
      return;
    }
    // cạnh phải đổi rộng, cạnh dưới đổi cao, góc dưới phải đổi cả hai; góc trên trái đứng yên
    this.host.aptResizeTo(d.room, d.handle === 'b' ? d.rect.w : d.rect.w + dx, d.handle === 'r' ? d.rect.h : d.rect.h + dy);
  }

  /* ---------- Phóng to, kéo bản vẽ ---------- */

  zoomIn(): void {
    this.zoom(ZOOM_STEP);
  }

  zoomOut(): void {
    this.zoom(1 / ZOOM_STEP);
  }

  fit(): void {
    this.viewport.fit();
    this.applyView();
  }

  private zoom(factor: number, at?: { x: number; y: number }): void {
    this.viewport.zoomBy(factor, at);
    this.applyView();
  }

  private applyView(): void {
    this.svg.setAttribute('viewBox', this.viewport.toString());
    this.onZoomChange();
  }

  /* ---------- Chuyển tọa độ ---------- */

  /** Điểm trên bản vẽ theo tọa độ của chính khung vẽ (trên mô hình cả căn là tọa độ căn hộ). */
  private toRaw(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const m = this.svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  /** Điểm theo tọa độ của phòng đang thao tác (xem origin). */
  private toPoint(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const p = this.toRaw(e);
    return { x: p.x - this.origin.x, y: p.y - this.origin.y };
  }

  /** Số đơn vị bản vẽ ứng với một pixel màn hình ở mức phóng to hiện tại. */
  private unitsPerPx(): number {
    const r = this.svg.getBoundingClientRect();
    return unitsPerPixel(this.viewport.view(), r.width, r.height);
  }

  private scopeNow(): Selection['scope'] {
    const v = this.host.view();
    return v.mode === 'elev' ? v.wall : 'floor';
  }

  /** Món dưới con trỏ, nếu có. */
  private itemAt(e: Event): Selection | null {
    const g = (e.target as Element | null)?.closest?.('.it');
    if (!g) return null;
    const uid = Number(g.getAttribute('data-uid'));
    return Number.isFinite(uid) ? { scope: this.scopeNow(), uid } : null;
  }

  /** Cửa đi hoặc cửa sổ dưới con trỏ, nếu có. */
  private openingAt(e: Event): OpeningSel | null {
    const g = (e.target as Element | null)?.closest?.('.op');
    if (!g) return null;
    const kind = g.getAttribute('data-kind');
    const uid = Number(g.getAttribute('data-uid'));
    return (kind === 'door' || kind === 'win') && Number.isFinite(uid) ? { kind: kind as OpeningKind, uid } : null;
  }

  /** Chọn cửa dưới con trỏ và chuẩn bị kéo. */
  private startOpeningDrag(sel: OpeningSel, e: PointerEvent): void {
    this.host.selectOpening(sel);
    const o = findOpening(this.host.layout(), sel);
    if (!o) return;
    const p = this.toPoint(e);
    const grab = this.host.view().mode === 'elev' ? grabOpeningWall(openRange(this.host.geo(), o)[0], p) : grabOpeningPlan(o, p);
    this.drag = { kind: 'op', sel, grab, moved: false };
  }

  /** Chỗ bút màu chạm vào: món, sàn hay tường. */
  private penTargetAt(e: PointerEvent): PenTarget | null {
    const sel = this.itemAt(e);
    if (sel) return { kind: 'item', sel };
    const p = this.toPoint(e);
    const R = this.host.geo();
    const v = this.host.view();
    if (v.mode === 'elev') {
      const len = wallLength(R, v.wall);
      if (p.x >= 0 && p.x <= len && p.y >= 0 && p.y <= R.ceil) return { kind: 'wall' };
      if (p.x >= 0 && p.x <= len && p.y > R.ceil && p.y <= R.ceil + 10) return { kind: 'floor' };
      if (p.y >= 0 && p.y <= R.ceil && p.x >= -10 && p.x <= len + 10) return { kind: 'wall' };
      return null;
    }
    if (p.x >= 0 && p.x <= R.W && p.y >= 0 && p.y <= R.H) return { kind: 'floor' };
    if (p.x >= -10 && p.x <= R.W + 10 && p.y >= -10 && p.y <= R.H + 10) return { kind: 'wall' };
    return null;
  }

  /* ---------- Con trỏ ---------- */

  private down(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const v = this.host.view();
    if (this.flying) return;
    this.origin = { x: 0, y: 0 };
    let room: RoomId | null = null;
    if (v.overview) {
      room = this.roomAt(e);
      if (v.aptEdit) {
        // chỉnh bố cục: nhấn vào phòng là chọn và dời phòng; nhấn ra ngoài thì kéo để dịch bản vẽ như thường
        if (this.aptEditDown(e)) return;
      } else if (room) {
        // sửa đồ: thao tác tiếp theo là trên phòng này, tọa độ tính theo góc trên trái của phòng
        this.host.focusRoom(room);
        const r = this.host.aptRects()[room];
        if (r) this.origin = { x: r.x, y: r.y };
      }
    }
    if (v.pen) {
      if (!v.overview || room) this.host.pen(this.penTargetAt(e));
      return;
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      this.svg.setPointerCapture(e.pointerId);
    } catch {
      /* trình duyệt không cho bắt con trỏ: vẫn dùng được */
    }
    if (this.pointers.size === 2) {
      this.startPinch();
      return;
    }
    if (this.pointers.size > 2) return;

    const layout = this.host.layout();
    const target = e.target as Element | null;
    if (target?.closest('.rot-handle') && v.mode === 'plan' && v.sel) {
      const it = findItem(layout, v.sel);
      if (it && canEdit(it, 'rotate')) this.drag = { kind: 'rot', sel: v.sel, moved: false };
      return;
    }
    const sel = this.itemAt(e);
    if (!sel) {
      const op = this.openingAt(e);
      if (op) this.startOpeningDrag(op, e);
      else this.drag = { kind: 'empty', x: e.clientX, y: e.clientY, moved: false, room };
      return;
    }
    this.host.select(sel);
    const it = findItem(this.host.layout(), sel);
    if (!it) return;
    if (!canEdit(it, 'move')) {
      this.drag = { kind: 'locked', sel, x: e.clientX, y: e.clientY, told: false };
      return;
    }
    const p = this.toPoint(e);
    const grab = v.mode === 'elev' ? grabWall(it, p, this.host.geo().ceil) : grabPlan(it, p);
    this.drag = { kind: 'item', sel, grab, moved: false, over: v.overview ? roomAtPoint(this.host.aptRects(), this.toRaw(e), 0, this.host.aptStack()) : null };
  }

  private move(e: PointerEvent): void {
    if (this.aptDrag) {
      this.aptEditMove(e);
      return;
    }
    const last = this.pointers.get(e.pointerId);
    if (last) {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && this.pointers.size === 2) {
        this.pinchMove();
        return;
      }
    }
    const d = this.drag;
    if (!d) return;
    const v = this.host.view();
    const R = this.host.geo();

    if (d.kind === 'empty') {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
      d.moved = true;
      if (!this.viewport.isZoomed) return;
      const k = this.unitsPerPx();
      this.viewport.panBy(-(e.clientX - (last?.x ?? d.x)) * k, -(e.clientY - (last?.y ?? d.y)) * k);
      this.applyView();
      return;
    }
    if (d.kind === 'locked') {
      if (!d.told && Math.hypot(e.clientX - d.x, e.clientY - d.y) >= CLICK_SLOP) {
        d.told = true;
        this.host.notice(t('Món này đã khóa nên không kéo được. Mở khóa ở bảng bên phải nếu muốn di chuyển.'));
      }
      return;
    }
    if (d.kind === 'op') {
      const l = this.host.layout();
      const o = findOpening(l, d.sel);
      if (!o) return;
      const p = this.toPoint(e);
      let wall = o.wall;
      let pos: number;
      if (v.mode === 'elev') {
        pos = dragOpeningWall(R, o, p, d.grab);
      } else {
        ({ wall, pos } = dragOpeningPlan(o, p, d.grab, R));
      }
      const from = o.wall;
      if (moveOpening(l, o, wall, pos, v.snap)) {
        // sang tường khác thì cửa nằm giữa con trỏ, chỗ nắm cũ không còn đúng nữa
        if (o.wall !== from) d.grab = o.w / 2;
        d.moved = true;
        this.host.changing();
      }
      return;
    }
    if (d.kind === 'item' && v.overview && this.crossRoom(d, e)) return;
    const it = findItem(this.host.layout(), d.sel);
    if (!it) return;
    const p = this.toPoint(e);

    if (d.kind === 'rot') {
      const rot = rotationAt(it as FloorItem, p, e.shiftKey, v.snap);
      if (rot !== (it as FloorItem).rot) {
        (it as FloorItem).rot = rot;
        d.moved = true;
        this.host.changing();
      }
      return;
    }
    if (v.mode === 'elev') {
      const w = it as WallItem;
      const next = dragWall(w, p, d.grab, { len: wallLength(R, v.wall), ceil: R.ceil }, v.snap);
      if (next.x !== w.x || next.y !== w.y) {
        w.x = next.x;
        w.y = next.y;
        d.moved = true;
        this.host.changing();
      }
      return;
    }
    const f = it as FloorItem;
    const next = dragPlan(f, p, d.grab, R, v.snap);
    if (next.x !== f.x || next.y !== f.y) {
      f.x = next.x;
      f.y = next.y;
      d.moved = true;
      this.host.changing();
    }
  }

  private up(e: PointerEvent): void {
    if (this.aptDrag) {
      const d = this.aptDrag;
      this.aptDrag = null;
      if (d.moved) this.host.aptCommit();
      return;
    }
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size > 0) return;
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if ((d.kind === 'item' || d.kind === 'rot' || d.kind === 'op') && d.moved) this.host.changed();
    else if (d.kind === 'empty' && !d.moved && e.type === 'pointerup') {
      const v = this.host.view();
      if (v.overview) {
        // bấm sàn trống của một phòng thì chọn phòng đó; bấm đúp thì zoom vào phòng; bấm ngoài mọi phòng thì bỏ chọn tất cả
        const tap = this.lastTap;
        this.lastTap = null;
        if (d.room && tap && tap.room === d.room && e.timeStamp - tap.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < CLICK_SLOP * 3) {
          this.host.openRoom(d.room);
          return;
        }
        if (d.room) this.lastTap = { room: d.room, t: e.timeStamp, x: e.clientX, y: e.clientY };
        this.host.aptSelect(d.room);
        if (!d.room && (v.sel || v.opening)) this.host.select(null);
      } else if (v.sel || v.opening) {
        // bấm chỗ trống thì bỏ chọn, dù đang chọn món hay cửa
        this.host.select(null);
      }
    }
  }

  /**
   * Mô hình cả căn: kéo đồ vừa đi vào một phòng khác (phòng nằm trên cùng dưới con trỏ) thì chuyển đồ sang phòng đó (tâm đồ ở ngay con trỏ),
   * rồi kéo tiếp theo phòng mới. Đồ bị phòng khác che (bóng cam) bắt đầu kéo ngay trong phòng che nó: chưa chuyển, chỉ khi ra rồi vào lại.
   * Trả về true nếu vừa chuyển phòng. Con trỏ ở hành lang (ngoài mọi phòng) thì đồ ở lại phòng cũ, kẹp trong phòng.
   */
  private crossRoom(d: Extract<Drag, { kind: 'item' }>, e: PointerEvent): boolean {
    const rects = this.host.aptRects();
    const raw = this.toRaw(e);
    const to = roomAtPoint(rects, raw, 0, this.host.aptStack());
    const was = d.over;
    d.over = to;
    if (!to || to === was || to === this.host.geo().id) return false;
    const r = rects[to];
    if (!r || !this.host.transferItem(d.sel, to, { x: raw.x - r.x, y: raw.y - r.y })) return false;
    this.origin = { x: r.x, y: r.y };
    d.grab = { dx: 0, dy: 0 };
    d.moved = true;
    return true;
  }

  /* ---------- Hai ngón và con lăn ---------- */

  private pair(): [{ x: number; y: number }, { x: number; y: number }] | null {
    const pts = [...this.pointers.values()];
    return pts.length === 2 ? [pts[0]!, pts[1]!] : null;
  }

  private startPinch(): void {
    const pr = this.pair();
    if (!pr) return;
    this.drag = null;
    this.pinch = { dist: Math.hypot(pr[0].x - pr[1].x, pr[0].y - pr[1].y), cx: (pr[0].x + pr[1].x) / 2, cy: (pr[0].y + pr[1].y) / 2 };
  }

  private pinchMove(): void {
    const pr = this.pair();
    const st = this.pinch;
    if (!pr || !st) return;
    const dist = Math.hypot(pr[0].x - pr[1].x, pr[0].y - pr[1].y);
    const cx = (pr[0].x + pr[1].x) / 2;
    const cy = (pr[0].y + pr[1].y) / 2;
    if (st.dist > 0 && dist > 0) this.viewport.zoomBy(dist / st.dist, this.toRaw({ clientX: cx, clientY: cy }));
    const k = this.unitsPerPx();
    this.viewport.panBy(-(cx - st.cx) * k, -(cy - st.cy) * k);
    st.dist = dist;
    st.cx = cx;
    st.cy = cy;
    this.applyView();
  }

  /** Giữ Ctrl (hoặc chụm hai ngón trên bàn di chuột) để phóng to. Cuộn thường vẫn cuộn trang. */
  private wheel(e: WheelEvent): void {
    if (this.flying) return;
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    this.zoom(Math.exp(-e.deltaY * WHEEL_STEP * (e.deltaMode === 1 ? 16 : 1)), this.toRaw(e));
  }

  /* ---------- Thả món từ thư viện ---------- */

  private dropped(e: DragEvent): void {
    e.preventDefault();
    const id = e.dataTransfer?.getData('text/plain');
    if (!id) return;
    const v = this.host.view();
    this.origin = { x: 0, y: 0 };
    const p = this.toPoint(e);
    let at: DropAt;
    if (v.overview) {
      // mô hình căn hộ: tọa độ căn hộ; app tìm phòng chứa chỗ thả (đồ, cửa) hoặc đặt phòng mới ở đó (loại phòng)
      at = { kind: 'apartment', x: p.x, y: p.y };
    } else if (v.mode === 'elev') {
      const R = this.host.geo();
      const def = this.host.registry.resolve(id);
      // thả vào đâu thì tâm món nằm ở đó
      const y = Math.max(0, R.ceil - p.y - (def?.h ?? 0) / 2);
      at = { kind: 'wall', wall: v.wall, s: p.x, y };
    } else {
      at = { kind: 'plan', x: p.x, y: p.y };
    }
    this.host.drop(id, at);
  }
}
