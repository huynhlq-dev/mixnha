import { clamp } from '../core/geometry';

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Số đơn vị bản vẽ ứng với một pixel màn hình, khi vùng nhìn view được đặt vừa vào khung rộng boxW, cao boxH (px).
 * SVG co vùng nhìn cho lọt khung theo chiều chật hơn, nên lấy hệ số lớn hơn của hai chiều.
 */
export function unitsPerPixel(view: Bounds, boxW: number, boxH: number): number {
  if (boxW <= 0 || boxH <= 0) return 1;
  return Math.max(view.w / boxW, view.h / boxH);
}

/** Chuỗi viewBox của SVG, làm tròn 2 chữ số thập phân. */
export function viewToString(v: Bounds): string {
  const r = (n: number) => Math.round(n * 100) / 100;
  return `${r(v.x)} ${r(v.y)} ${r(v.w)} ${r(v.h)}`;
}

/** Đọc lại chuỗi viewBox "x y w h"; sai dạng hoặc kích thước không dương thì null. */
export function parseView(s: string | null): Bounds | null {
  const p = (s ?? '').trim().split(/[\s,]+/).map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isFinite(n)) || p[2]! <= 0 || p[3]! <= 0) return null;
  return { x: p[0]!, y: p[1]!, w: p[2]!, h: p[3]! };
}

/** Làm chậm ở hai đầu, nhanh ở giữa. t trong khoảng 0 đến 1. */
export function easeInOut(t: number): number {
  const k = clamp(t, 0, 1);
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

/**
 * Vùng nhìn ở thời điểm t (0 đến 1) khi bay từ a tới b: tâm đi thẳng, còn cỡ vùng nhìn đổi theo cấp số nhân
 * để zoom vào hoặc ra đều tay (đổi tuyến tính sẽ thấy lúc đầu chậm, lúc cuối đột ngột).
 */
export function lerpView(a: Bounds, b: Bounds, t: number): Bounds {
  const k = clamp(t, 0, 1);
  const w = a.w * Math.pow(b.w / a.w, k);
  const h = a.h * Math.pow(b.h / a.h, k);
  const cx = a.x + a.w / 2 + (b.x + b.w / 2 - (a.x + a.w / 2)) * k;
  const cy = a.y + a.h / 2 + (b.y + b.h / 2 - (a.y + a.h / 2)) * k;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;

/**
 * Vùng nhìn của khung vẽ. Phóng to và kéo bản vẽ chỉ đổi vùng nhìn (viewBox), không đổi dữ liệu
 * và không đi vào lịch sử Hoàn tác. Thuần tính toán, không đụng tới DOM.
 */
export class Viewport {
  private base: Bounds = { x: 0, y: 0, w: 100, h: 100 };
  private zoom = MIN_ZOOM;
  /** Tâm vùng đang nhìn, theo tọa độ bản vẽ. */
  private cx = 50;
  private cy = 50;

  /** Đặt khung chứa toàn bộ bản vẽ (kể cả lề). Giữ mức phóng to hiện tại, kẹp lại cho khỏi lệch ra ngoài. */
  setBase(b: Bounds): void {
    this.base = { ...b };
    this.clampCenter();
  }

  /** Về vừa khung: nhìn toàn bộ bản vẽ. */
  fit(): void {
    this.zoom = MIN_ZOOM;
    this.cx = this.base.x + this.base.w / 2;
    this.cy = this.base.y + this.base.h / 2;
  }

  get level(): number {
    return this.zoom;
  }

  get isZoomed(): boolean {
    return this.zoom > MIN_ZOOM + 0.001;
  }

  get canZoomIn(): boolean {
    return this.zoom < MAX_ZOOM - 0.001;
  }

  /** Vùng đang nhìn. */
  view(): Bounds {
    const w = this.base.w / this.zoom;
    const h = this.base.h / this.zoom;
    return { x: this.cx - w / 2, y: this.cy - h / 2, w, h };
  }

  /** Chuỗi viewBox của SVG. */
  toString(): string {
    return viewToString(this.view());
  }

  /** Phóng to hoặc thu nhỏ theo hệ số, giữ nguyên điểm `at` (tọa độ bản vẽ) đứng yên trên màn hình. Mặc định lấy tâm. */
  zoomBy(factor: number, at?: { x: number; y: number }): void {
    const next = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    if (next === this.zoom) return;
    const v = this.view();
    const p = at ?? { x: this.cx, y: this.cy };
    const u = (p.x - v.x) / v.w;
    const t = (p.y - v.y) / v.h;
    this.zoom = next;
    const w = this.base.w / next;
    const h = this.base.h / next;
    this.cx = p.x - u * w + w / 2;
    this.cy = p.y - t * h + h / 2;
    this.clampCenter();
  }

  /** Kéo bản vẽ theo (dx, dy) tính bằng đơn vị bản vẽ: dương nghĩa là vùng nhìn dịch sang phải, xuống dưới. */
  panBy(dx: number, dy: number): void {
    this.cx += dx;
    this.cy += dy;
    this.clampCenter();
  }

  /** Vùng nhìn không được trượt ra ngoài khung bản vẽ. */
  private clampCenter(): void {
    const w = this.base.w / this.zoom;
    const h = this.base.h / this.zoom;
    this.cx = clamp(this.cx, this.base.x + w / 2, this.base.x + this.base.w - w / 2);
    this.cy = clamp(this.cy, this.base.y + h / 2, this.base.y + this.base.h - h / 2);
  }
}
