import { clamp } from '../core/geometry';

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
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
    const v = this.view();
    const r = (n: number) => Math.round(n * 100) / 100;
    return `${r(v.x)} ${r(v.y)} ${r(v.w)} ${r(v.h)}`;
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
