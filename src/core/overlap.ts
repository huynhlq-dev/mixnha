import type { Box } from './interior';

/** Độ dày tường bao quanh mỗi phòng (cm). Phòng nằm trên che luôn cả tường của nó. */
export const WALL = 10;
/**
 * Diện tích tối thiểu còn thấy được của một phòng (cm²) khi bị các phòng nằm trên che bớt. Ít hơn mức này thì không cho che thêm,
 * để phòng không bị nuốt mất.
 */
export const MIN_VISIBLE = 30_000;

const grow = (b: Box, d: number): Box => ({ x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d });

/** Hai phòng có chồng lên nhau không, kể cả tường 10 cm quanh mỗi phòng (hai lớp tường chỉ chạm nhau thì chưa tính là chồng). */
export function overlaps(a: Box, b: Box): boolean {
  const ga = grow(a, WALL);
  const gb = grow(b, WALL);
  return ga.x < gb.x + gb.w && ga.x + ga.w > gb.x && ga.y < gb.y + gb.h && ga.y + ga.h > gb.y;
}

/**
 * Thứ tự lớp từ dưới lên trên: z nhỏ ở dưới, cùng z thì phòng đứng sau trong `ids` nằm trên. Không đổi `ids`.
 */
export function stackOrder<K extends string>(ids: readonly K[], z: (id: K) => number): K[] {
  return ids
    .map((id, i) => ({ id, i, z: z(id) }))
    .sort((a, b) => a.z - b.z || a.i - b.i)
    .map((x) => x.id);
}

/**
 * Các hình chữ nhật che mỗi phòng: các phòng nằm trên nó trong `stack` (từ dưới lên), mỗi phòng nới thêm WALL cho cả tường.
 * Chỉ giữ những hình có chạm vào phòng. Theo tọa độ căn hộ.
 */
export function coversOf<K extends string>(rects: Readonly<Record<K, Box>>, stack: readonly K[]): Record<K, Box[]> {
  const out = {} as Record<K, Box[]>;
  stack.forEach((id, i) => {
    const b = rects[id];
    out[id] = stack
      .slice(i + 1)
      .map((o) => grow(rects[o], WALL))
      .filter((c) => c.x < b.x + b.w && c.x + c.w > b.x && c.y < b.y + b.h && c.y + c.h > b.y);
  });
  return out;
}

/**
 * Phần của `base` không bị `covers` che, tách thành các hình chữ nhật rời nhau (gộp theo hàng rồi theo cột).
 * Dùng cho diện tích phòng bị khuyết và cho việc dò đồ bị che.
 */
export function uncovered(base: Box, covers: readonly Box[]): Box[] {
  const x1 = base.x + base.w;
  const y1 = base.y + base.h;
  const xs = new Set([base.x, x1]);
  const ys = new Set([base.y, y1]);
  for (const c of covers) {
    for (const v of [c.x, c.x + c.w]) if (v > base.x && v < x1) xs.add(v);
    for (const v of [c.y, c.y + c.h]) if (v > base.y && v < y1) ys.add(v);
  }
  const X = [...xs].sort((a, b) => a - b);
  const Y = [...ys].sort((a, b) => a - b);
  const free = (cx: number, cy: number): boolean => !covers.some((c) => cx > c.x && cx < c.x + c.w && cy > c.y && cy < c.y + c.h);
  // mỗi hàng: gộp các ô trống liền nhau theo chiều ngang
  const rows: { x: number; w: number }[][] = [];
  for (let j = 0; j < Y.length - 1; j++) {
    const row: { x: number; w: number }[] = [];
    for (let i = 0; i < X.length - 1; i++) {
      if (!free((X[i]! + X[i + 1]!) / 2, (Y[j]! + Y[j + 1]!) / 2)) continue;
      const last = row[row.length - 1];
      if (last && last.x + last.w === X[i]!) last.w += X[i + 1]! - X[i]!;
      else row.push({ x: X[i]!, w: X[i + 1]! - X[i]! });
    }
    rows.push(row);
  }
  // rồi gộp các hàng liền nhau có cùng đoạn trống theo chiều dọc
  const out: Box[] = [];
  let open = new Map<string, Box>();
  for (let j = 0; j < rows.length; j++) {
    const now = new Map<string, Box>();
    for (const r of rows[j]!) {
      const k = `${r.x}:${r.w}`;
      const above = open.get(k);
      if (above) {
        above.h += Y[j + 1]! - Y[j]!;
        now.set(k, above);
      } else {
        const b = { x: r.x, y: Y[j]!, w: r.w, h: Y[j + 1]! - Y[j]! };
        out.push(b);
        now.set(k, b);
      }
    }
    open = now;
  }
  return out;
}

/** Diện tích (cm²) còn thấy của `base` sau khi bị `covers` che. */
export function uncoveredArea(base: Box, covers: readonly Box[]): number {
  return uncovered(base, covers).reduce((s, b) => s + b.w * b.h, 0);
}

/** Diện tích còn thấy (m²) của từng phòng, theo thứ tự lớp `stack` (từ dưới lên). */
export function roomAreas<K extends string>(rects: Readonly<Record<K, Box>>, stack: readonly K[]): Record<K, number> {
  const covers = coversOf(rects, stack);
  const out = {} as Record<K, number>;
  for (const id of stack) out[id] = uncoveredArea(rects[id], covers[id]) / 10_000;
  return out;
}

/** Diện tích còn thấy (m²) của từng hộp trong danh sách xếp từ dưới lên trên (hộp đứng sau nằm trên hộp đứng trước). */
export function visibleAreas(boxes: readonly Box[]): number[] {
  const ids = boxes.map((_, i) => String(i));
  const rects = Object.fromEntries(boxes.map((b, i) => [String(i), b]));
  const covers = coversOf(rects, ids);
  return ids.map((id, i) => uncoveredArea(boxes[i]!, covers[id]!) / 10_000);
}

/** Mọi phòng đều còn thấy ít nhất MIN_VISIBLE sau khi chồng lên nhau theo `stack`. */
export function visibleEnough<K extends string>(rects: Readonly<Record<K, Box>>, stack: readonly K[]): boolean {
  const covers = coversOf(rects, stack);
  return stack.every((id) => !covers[id].length || uncoveredArea(rects[id], covers[id]) >= MIN_VISIBLE);
}

/** Phòng nằm trên cùng tại điểm p (theo tọa độ căn hộ). pad mở rộng mỗi phía, ví dụ độ dày tường. Điểm ở hành lang thì null. */
export function topmostAt<K extends string>(rects: Readonly<Record<K, Box>>, stack: readonly K[], p: { x: number; y: number }, pad = 0): K | null {
  for (let i = stack.length - 1; i >= 0; i--) {
    const r = rects[stack[i]!];
    if (p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad) return stack[i]!;
  }
  return null;
}
