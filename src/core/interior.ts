import { visibleAreas } from './overlap';

/** Hình chữ nhật theo tọa độ căn hộ (cm): góc trên trái, rộng, cao. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cạnh ô lưới khi dò khoảng trống (cm). */
export const CELL = 10;
/**
 * Khoảng trống giữa các phòng hẹp hơn mức này (cm) thì coi là hành lang, nằm trong nhà và được tính vào diện tích.
 * Rộng hơn thì là ngoài trời hoặc chỗ chưa bố trí, không tính.
 */
export const HALL_MAX = 150;
/** Số ô lưới tối đa khi dò khoảng trống; quá thì bỏ qua (căn hộ trải quá rộng thì cũng không có hành lang kín). */
const MAX_CELLS = 1_000_000;
/** Độ dày tường quanh mỗi phòng (cm): phần này không phải khoảng trống. */
const WALL = 10;
// (rects chồng nhau thì phòng đứng sau nằm trên: diện tích phòng chỉ tính phần còn thấy, xem overlap.ts)

export interface Interior {
  /** Tổng diện tích các phòng (m²), theo cỡ bên trong tường. */
  rooms: number;
  /** Khoảng trống kín giữa các phòng, tức hành lang (m²). */
  gaps: number;
  /** Diện tích trong nhà: phòng cộng hành lang (m²). */
  total: number;
  /** Các hình chữ nhật phủ khoảng trống đó (cm), để vẽ nền hành lang. */
  bands: Box[];
}

const EMPTY: Interior = { rooms: 0, gaps: 0, total: 0, bands: [] };

/** Giãn hoặc co (square, bán kính r ô) theo từng hàng rồi từng cột. grow: giãn (ô nào có ô bật trong cửa sổ thì bật); không thì co (chỉ bật khi cả cửa sổ đều bật). */
function morph(src: Uint8Array, nx: number, ny: number, r: number, grow: boolean): Uint8Array {
  const win = 2 * r + 1;
  const pass = (a: Uint8Array, len: number, lines: number, stride: number, step: number): Uint8Array => {
    const out = new Uint8Array(a.length);
    for (let l = 0; l < lines; l++) {
      const base = l * stride;
      // tổng trượt trên cửa sổ [i - r, i + r]; ngoài lưới tính là tắt
      let sum = 0;
      for (let i = 0; i < Math.min(r, len); i++) sum += a[base + i * step]!;
      for (let i = 0; i < len; i++) {
        if (i + r < len) sum += a[base + (i + r) * step]!;
        if (i - r - 1 >= 0) sum -= a[base + (i - r - 1) * step]!;
        out[base + i * step] = grow ? (sum > 0 ? 1 : 0) : sum === win ? 1 : 0;
      }
    }
    return out;
  };
  return pass(pass(src, nx, ny, nx, 1), ny, nx, 1, nx);
}

let last: { key: string; value: Interior } | null = null;

/**
 * Diện tích trong nhà của một cách bố trí các phòng. Phòng là những ô đặc (kể cả tường 10 cm quanh nó); khoảng trống nằm giữa các phòng
 * mà hẹp hơn `hall` thì là hành lang và được cộng vào diện tích. Dò bằng phép đóng hình (giãn rồi co) trên lưới CELL cm: khe hẹp giữa
 * hai phòng, hoặc chỗ lõm hẹp bị các phòng kẹp hai bên, được lấp; chỗ hở rộng ra ngoài thì không.
 */
export function interiorSpace(rects: readonly Box[], hall: number = HALL_MAX): Interior {
  if (!rects.length) return EMPTY;
  const key = `${hall}|${rects.map((r) => `${r.x},${r.y},${r.w},${r.h}`).join(';')}`;
  if (last?.key === key) return last.value;

  // khe rộng w ô được lấp khi w ≤ 2r; muốn khe hẹp hơn `hall` thì r = (hall / CELL - 1) / 2
  const r = Math.max(1, Math.floor((Math.ceil(hall / CELL) - 1) / 2));
  const pad = WALL + (r + 2) * CELL;
  const x0 = Math.floor((Math.min(...rects.map((b) => b.x)) - pad) / CELL) * CELL;
  const y0 = Math.floor((Math.min(...rects.map((b) => b.y)) - pad) / CELL) * CELL;
  const nx = Math.ceil((Math.max(...rects.map((b) => b.x + b.w)) + pad - x0) / CELL);
  const ny = Math.ceil((Math.max(...rects.map((b) => b.y + b.h)) + pad - y0) / CELL);
  // căn hộ trải quá rộng (các phòng cách nhau hàng chục mét) thì không dò khoảng trống, chỉ tính diện tích các phòng
  if (nx * ny > MAX_CELLS) {
    const only = visibleAreas(rects).reduce((a, v) => a + v, 0);
    const value: Interior = { rooms: only, gaps: 0, total: only, bands: [] };
    last = { key, value };
    return value;
  }
  const occ = new Uint8Array(nx * ny);
  for (const b of rects) {
    // ô nào có tâm nằm trong phòng (kể cả tường) thì là ô đặc
    const i0 = Math.max(0, Math.ceil((b.x - WALL - x0) / CELL - 0.5));
    const i1 = Math.min(nx - 1, Math.floor((b.x + b.w + WALL - x0) / CELL - 0.5));
    const j0 = Math.max(0, Math.ceil((b.y - WALL - y0) / CELL - 0.5));
    const j1 = Math.min(ny - 1, Math.floor((b.y + b.h + WALL - y0) / CELL - 0.5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) occ[j * nx + i] = 1;
  }
  const closed = morph(morph(occ, nx, ny, r, true), nx, ny, r, false);

  const rows: { x: number; w: number }[][] = [];
  let cells = 0;
  for (let j = 0; j < ny; j++) {
    const runs: { x: number; w: number }[] = [];
    let start = -1;
    for (let i = 0; i <= nx; i++) {
      const gap = i < nx && closed[j * nx + i] === 1 && occ[j * nx + i] === 0;
      if (gap) {
        cells++;
        if (start < 0) start = i;
      } else if (start >= 0) {
        runs.push({ x: start, w: i - start });
        start = -1;
      }
    }
    rows.push(runs);
  }
  // các hàng liền nhau có đoạn trống giống hệt thì gộp thành một hình chữ nhật
  const bands: Box[] = [];
  const open = new Map<string, Box>();
  for (let j = 0; j < ny; j++) {
    const now = new Map<string, Box>();
    for (const run of rows[j]!) {
      const k = `${run.x}:${run.w}`;
      const above = open.get(k);
      if (above) {
        above.h += CELL;
        now.set(k, above);
      } else {
        const box = { x: x0 + run.x * CELL, y: y0 + j * CELL, w: run.w * CELL, h: CELL };
        bands.push(box);
        now.set(k, box);
      }
    }
    open.clear();
    for (const [k, v] of now) open.set(k, v);
  }

  const roomsArea = visibleAreas(rects).reduce((s, a) => s + a, 0);
  const gaps = (cells * CELL * CELL) / 10000;
  const value: Interior = { rooms: roomsArea, gaps, total: roomsArea + gaps, bands };
  last = { key, value };
  return value;
}
