import { canEdit, findItem } from '../core/layout';
import { wallLength } from '../core/geometry';
import type { FloorItem, Selection, WallItem } from '../core/types';
import { dragWall, grabWall, renderElevation } from './elevation';
import type { Frame } from './frame';
import type { DropAt, Host, PenTarget } from './host';
import { dragPlan, grabPlan, renderPlan, rotationAt, type Grab } from './plan';
import { Viewport } from './viewport';

/** Con trỏ di chuyển ít hơn mức này (px) thì coi là bấm chứ không phải kéo. */
const CLICK_SLOP = 4;
/** Hệ số mỗi nấc cuộn chuột khi giữ Ctrl. */
const WHEEL_STEP = 0.0015;
/** Hệ số mỗi lần bấm nút + hoặc −. */
export const ZOOM_STEP = 1.4;

type Drag =
  | { kind: 'item'; sel: Selection; grab: Grab; moved: boolean }
  | { kind: 'locked'; sel: Selection; x: number; y: number; told: boolean }
  | { kind: 'rot'; sel: Selection; moved: boolean }
  | { kind: 'empty'; x: number; y: number; moved: boolean };

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

  render(): Frame {
    const v = this.host.view();
    const layout = this.host.layout();
    const R = this.host.geo();
    const reg = this.host.registry;
    const frame =
      v.mode === 'elev'
        ? renderElevation({ layout, R, reg, wall: v.wall, sel: v.sel, dim: v.dim })
        : renderPlan({ layout, R, reg, sel: v.sel, dim: v.dim });
    // đổi phòng, đổi kiểu xem hoặc đổi tường thì nhìn lại toàn bộ; chỉ đổi kích thước thì giữ mức phóng to
    const key = `${R.id}:${v.mode}:${v.mode === 'elev' ? v.wall : ''}`;
    this.viewport.setBase(frame.bounds);
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.viewport.fit();
      this.onZoomChange();
    }
    this.svg.setAttribute('viewBox', this.viewport.toString());
    this.svg.setAttribute('aria-label', frame.aria);
    this.svg.innerHTML = frame.svg;
    return frame;
  }

  /** Đưa focus về món đang chọn, vì vẽ lại làm mất focus (dùng sau khi di chuyển bằng phím mũi tên). */
  focusSelected(): void {
    const sel = this.host.view().sel;
    if (!sel) return;
    this.svg.querySelector<SVGGElement>(`.it[data-uid="${sel.uid}"]`)?.focus();
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

  private toPoint(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const m = this.svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  /** Số đơn vị bản vẽ ứng với một pixel màn hình ở mức phóng to hiện tại. */
  private unitsPerPx(): number {
    const r = this.svg.getBoundingClientRect();
    return r.width > 0 ? this.viewport.view().w / r.width : 1;
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
    if (v.pen) {
      this.host.pen(this.penTargetAt(e));
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
      this.drag = { kind: 'empty', x: e.clientX, y: e.clientY, moved: false };
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
    this.drag = { kind: 'item', sel, grab, moved: false };
  }

  private move(e: PointerEvent): void {
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
        this.host.notice('Món này đã khóa nên không kéo được. Mở khóa ở bảng bên phải nếu muốn di chuyển.');
      }
      return;
    }
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
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size > 0) return;
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if ((d.kind === 'item' || d.kind === 'rot') && d.moved) this.host.changed();
    else if (d.kind === 'empty' && !d.moved && e.type === 'pointerup' && this.host.view().sel) this.host.select(null);
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
    if (st.dist > 0 && dist > 0) this.viewport.zoomBy(dist / st.dist, this.toPoint({ clientX: cx, clientY: cy }));
    const k = this.unitsPerPx();
    this.viewport.panBy(-(cx - st.cx) * k, -(cy - st.cy) * k);
    st.dist = dist;
    st.cx = cx;
    st.cy = cy;
    this.applyView();
  }

  /** Giữ Ctrl (hoặc chụm hai ngón trên bàn di chuột) để phóng to. Cuộn thường vẫn cuộn trang. */
  private wheel(e: WheelEvent): void {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    this.zoom(Math.exp(-e.deltaY * WHEEL_STEP * (e.deltaMode === 1 ? 16 : 1)), this.toPoint(e));
  }

  /* ---------- Thả món từ thư viện ---------- */

  private dropped(e: DragEvent): void {
    e.preventDefault();
    const id = e.dataTransfer?.getData('text/plain');
    if (!id) return;
    const v = this.host.view();
    const p = this.toPoint(e);
    let at: DropAt;
    if (v.mode === 'elev') {
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
