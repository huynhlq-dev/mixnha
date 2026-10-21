import type { DoorDef, WallKey } from '../data/schema';

/** Hình chữ nhật ngang dọc, đơn vị cm. */
export interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
export interface Box extends Rect {
  w: number;
  h: number;
}
export type Point = [number, number];

/** Vật thể có thể xoay trên mặt bằng. x, y là tâm. */
export interface Placed {
  x: number;
  y: number;
  w: number;
  d: number;
  rot: number;
}

/** Khung bao ngang dọc của món đã xoay một góc bất kỳ. */
export function boxOf(it: Placed): Box {
  const a = (it.rot * Math.PI) / 180;
  const c = Math.abs(Math.round(Math.cos(a) * 1e6) / 1e6);
  const s = Math.abs(Math.round(Math.sin(a) * 1e6) / 1e6);
  const hw = (c * it.w + s * it.d) / 2;
  const hh = (s * it.w + c * it.d) / 2;
  return { x0: it.x - hw, x1: it.x + hw, y0: it.y - hh, y1: it.y + hh, w: hw * 2, h: hh * 2 };
}

/** Bốn góc thật của món sau khi xoay (cùng chiều quay với SVG và 3D). */
export function polyOf(it: Placed): Point[] {
  const a = (it.rot * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const hw = it.w / 2;
  const hd = it.d / 2;
  const corners: Point[] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  return corners.map(([px, py]): Point => [it.x + px * c - py * s, it.y + px * s + py * c]);
}

export function polyOfRect(r: Rect): Point[] {
  return [
    [r.x0, r.y0],
    [r.x1, r.y0],
    [r.x1, r.y1],
    [r.x0, r.y1],
  ];
}

/** Hai hình lồi có chồng nhau không (chạm mép dưới 0,5 cm không tính). */
export function satHit(A: Point[], B: Point[]): boolean {
  for (const P of [A, B]) {
    for (let i = 0; i < P.length; i++) {
      const p = P[i]!;
      const q = P[(i + 1) % P.length]!;
      let nx = q[1] - p[1];
      let ny = p[0] - q[0];
      const len = Math.hypot(nx, ny);
      if (!len) continue;
      nx /= len;
      ny /= len;
      let a0 = Infinity;
      let a1 = -Infinity;
      let b0 = Infinity;
      let b1 = -Infinity;
      for (const m of A) {
        const d = m[0] * nx + m[1] * ny;
        if (d < a0) a0 = d;
        if (d > a1) a1 = d;
      }
      for (const m of B) {
        const d = m[0] * nx + m[1] * ny;
        if (d < b0) b0 = d;
        if (d > b1) b1 = d;
      }
      if (a1 <= b0 + 0.5 || b1 <= a0 + 0.5) return false;
    }
  }
  return true;
}

/** Hai hình chữ nhật ngang dọc có chồng nhau không (chạm mép dưới 0,5 cm không tính). */
export function rectsHit(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5;
}

export function normDeg(d: number): number {
  let r = d % 360;
  if (r < 0) r += 360;
  return r;
}

/**
 * Xoay tự do. Bình thường nam châm hút vào 0, 45, 90... trong ±3°.
 * Giữ Shift thì nhảy 15°. Tắt bám lưới thì xoay mịn.
 */
export function snapAngle(deg: number, shift: boolean, snapOn: boolean): number {
  let d = normDeg(deg);
  if (shift) d = Math.round(d / 15) * 15;
  else if (snapOn) {
    const m = Math.round(d / 45) * 45;
    if (Math.abs(d - m) <= 3) d = m;
  }
  return normDeg(Math.round(d * 10) / 10);
}

/** Làm tròn góc về 0,1 độ và đưa về khoảng 0 đến 360. */
export function roundDeg(d: number): number {
  return normDeg(Math.round(d * 10) / 10);
}

const WALL_DIR: Record<WallKey, { u: Point; n: Point }> = {
  T: { u: [1, 0], n: [0, 1] },
  B: { u: [1, 0], n: [0, -1] },
  L: { u: [0, 1], n: [1, 0] },
  R: { u: [0, 1], n: [-1, 0] },
};

export interface RoomSize {
  W: number;
  H: number;
}

export interface DoorGeom {
  s: Point;
  e: Point;
  t: Point;
  sweep: 0 | 1;
  /** Vùng cánh cửa quét khi mở, không nên đặt đồ vào. */
  zone: Rect;
  /** Khoảng hở trên tường để vẽ. */
  gap: { x: number; y: number; w: number; h: number };
  w: number;
}

export function doorGeom(R: RoomSize, d: DoorDef): DoorGeom {
  const s: Point = d.wall === 'T' ? [d.pos, 0] : d.wall === 'B' ? [d.pos, R.H] : d.wall === 'L' ? [0, d.pos] : [R.W, d.pos];
  const { u, n } = WALL_DIR[d.wall];
  const w = d.w;
  const e: Point = [s[0] + u[0] * w, s[1] + u[1] * w];
  const t: Point = [s[0] + n[0] * w, s[1] + n[1] * w];
  const c: Point = [e[0] + n[0] * w, e[1] + n[1] * w];
  const cross = u[0] * n[1] - u[1] * n[0];
  const zone: Rect = {
    x0: Math.min(s[0], c[0]),
    x1: Math.max(s[0], c[0]),
    y0: Math.min(s[1], c[1]),
    y1: Math.max(s[1], c[1]),
  };
  const gap =
    d.wall === 'T' ? { x: d.pos, y: -10, w, h: 10 } : d.wall === 'B' ? { x: d.pos, y: R.H, w, h: 10 } : d.wall === 'L' ? { x: -10, y: d.pos, w: 10, h: w } : { x: R.W, y: d.pos, w: 10, h: w };
  return { s, e, t, sweep: cross > 0 ? 1 : 0, zone, gap, w };
}

export function windowGeom(R: RoomSize, d: DoorDef): { x: number; y: number; w: number; h: number } {
  return d.wall === 'T' ? { x: d.pos, y: -10, w: d.w, h: 10 } : d.wall === 'B' ? { x: d.pos, y: R.H, w: d.w, h: 10 } : d.wall === 'L' ? { x: -10, y: d.pos, w: 10, h: d.w } : { x: R.W, y: d.pos, w: 10, h: d.w };
}

/** Chiều dài của một bức tường (cm). */
export function wallLength(R: RoomSize, w: WallKey): number {
  return w === 'T' || w === 'B' ? R.W : R.H;
}

/**
 * Đổi hình chiếu của đồ trên sàn sang tọa độ dọc theo tường
 * (trái sang phải khi đứng trong phòng nhìn ra tường).
 */
export function planToWall(R: RoomSize, w: WallKey, r: Rect): { s0: number; s1: number; dist: number } {
  if (w === 'T') return { s0: r.x0, s1: r.x1, dist: r.y0 };
  if (w === 'B') return { s0: R.W - r.x1, s1: R.W - r.x0, dist: R.H - r.y1 };
  if (w === 'L') return { s0: R.H - r.y1, s1: R.H - r.y0, dist: r.x0 };
  return { s0: r.y0, s1: r.y1, dist: R.W - r.x1 };
}

/** Khoảng của cửa dọc theo tường, theo cùng hệ tọa độ với mặt đứng. */
export function openRange(R: RoomSize, d: DoorDef): [number, number] {
  if (d.wall === 'T' || d.wall === 'R') return [d.pos, d.pos + d.w];
  if (d.wall === 'B') return [R.W - d.pos - d.w, R.W - d.pos];
  return [R.H - d.pos - d.w, R.H - d.pos];
}

/** Hình chữ nhật của đồ gắn tường trên mặt đứng. x là tâm dọc tường, y là mép dưới. */
export function wallRect(it: { x: number; y: number; w: number; h: number }): Rect {
  return { x0: it.x - it.w / 2, x1: it.x + it.w / 2, y0: it.y, y1: it.y + it.h };
}

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
