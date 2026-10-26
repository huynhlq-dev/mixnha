import type { DoorDef, DoorHinge, DoorSwing, ItemDef, OpeningPreset, WallKey } from '../data/schema';
import { alongWall, clamp, nearestWall, posFromRange, roundDeg, wallLength } from './geometry';
import { canEdit, countItems, makeFloorItem, makeWallItem, snapValue } from './layout';
import { WALL_KEYS } from '../data/walls';
import { LIMITS } from './limits';
import { fitOpening } from './room';
import type { AnyItem, DoorItem, FloorItem, Layout, OpeningKind, OpeningSel, Scope, Selection, WallItem, WindowItem } from './types';

/**
 * Các thao tác sửa bản vẽ do người dùng bấm (thêm, xoay, dịch, đổi số đo, khóa, dời cửa). Mỗi hàm chỉ sửa dữ liệu, không biết gì về giao diện,
 * nên kiểm thử được mà không cần trình duyệt. Hàm nào có thể bị chặn bởi khóa món thì hỏi canEdit và trả về false khi bị chặn.
 */

export function isFull(l: Layout): boolean {
  return countItems(l) >= LIMITS.maxItemsPerRoom;
}

/** Thêm một món đặt sàn. at là null thì đặt giữa phòng. Tâm món nằm trong phòng, bám lưới nếu snap. */
export function addFloorItem(l: Layout, def: ItemDef, at: { x: number; y: number } | null, snap: boolean, uid: number): Selection {
  const x = clamp(snapValue(at?.x ?? l.W / 2, snap), 0, l.W);
  const y = clamp(snapValue(at?.y ?? l.H / 2, snap), 0, l.H);
  l.items.push(makeFloorItem(def, x, y, 0, undefined, uid));
  return { scope: 'floor', uid };
}

/**
 * Thêm một món gắn tường. s là vị trí dọc tường (null: giữa tường), y là độ cao mép dưới (null: theo khai báo của món).
 * Chỗ thả được kẹp để món nằm trong tường.
 */
export function addWallItem(l: Layout, def: ItemDef, wall: WallKey, s: number | null, y: number | null, snap: boolean, uid: number): Selection {
  const len = wallLength(l, wall);
  const x = clamp(snapValue(s ?? len / 2, snap), 0, len);
  const yy = y === null ? (def.y ?? 0) : clamp(snapValue(y, snap), 0, Math.max(0, l.ceil - def.h));
  l.walls[wall].push(makeWallItem(def, x, yy, uid));
  return { scope: wall, uid };
}

/** Xoay món sàn thêm delta độ. Trả về false nếu món đã khóa. */
export function rotateBy(it: FloorItem, delta: number): boolean {
  if (!canEdit(it, 'rotate')) return false;
  it.rot = roundDeg(it.rot + delta);
  return true;
}

export function setRotation(it: FloorItem, deg: number): boolean {
  if (!canEdit(it, 'rotate') || !Number.isFinite(deg)) return false;
  it.rot = roundDeg(deg);
  return true;
}

export type Dir = 'left' | 'right' | 'up' | 'down';

/**
 * Dịch món bằng phím mũi tên. Trên mặt bằng mũi tên lên là giảm y. Trên mặt đứng mũi tên lên là nâng món lên cao hơn.
 * Trả về true nếu vị trí thật sự đổi (đã tới mép thì không đổi).
 */
export function nudge(l: Layout, scope: Scope, it: AnyItem, dir: Dir, step: number): boolean {
  if (!canEdit(it, 'move')) return false;
  const x0 = it.x;
  const y0 = it.y;
  if (scope === 'floor') {
    if (dir === 'left') it.x = Math.max(0, it.x - step);
    else if (dir === 'right') it.x = Math.min(l.W, it.x + step);
    else if (dir === 'up') it.y = Math.max(0, it.y - step);
    else it.y = Math.min(l.H, it.y + step);
  } else {
    const w = it as WallItem;
    const len = wallLength(l, scope);
    if (dir === 'left') w.x = Math.max(0, w.x - step);
    else if (dir === 'right') w.x = Math.min(len, w.x + step);
    else if (dir === 'up') w.y = Math.max(0, Math.min(l.ceil - w.h, w.y + step));
    else w.y = Math.max(0, w.y - step);
  }
  return it.x !== x0 || it.y !== y0;
}

export type FloorField = 'w' | 'd';
export type WallField = 'w' | 'h' | 'y';

/** Giá trị gõ vào ô số: số nguyên trong khoảng cho phép, hoặc null nếu chưa hợp lệ (đang gõ dở, để trống, ngoài khoảng). */
export function parseWhole(raw: string, lo: number, hi: number): number | null {
  if (raw.trim() === '') return null;
  const v = Number(raw);
  if (!Number.isFinite(v)) return null;
  const r = Math.round(v);
  return r >= lo && r <= hi ? r : null;
}

export function fieldRange(field: WallField): { min: number; max: number } {
  return field === 'y' ? LIMITS.itemY : LIMITS.itemSize;
}

/** Đổi rộng hoặc sâu của món sàn. Trả về false nếu món đã khóa. */
export function setFloorSize(it: FloorItem, field: FloorField, v: number): boolean {
  if (!canEdit(it, 'resize')) return false;
  it[field] = clamp(Math.round(v), LIMITS.itemSize.min, LIMITS.itemSize.max);
  return true;
}

/** Đổi rộng, cao hoặc độ cao mép dưới của món tường. Dịch lên xuống (y) tính là di chuyển, đổi số đo tính là đổi kích thước. */
export function setWallField(it: WallItem, field: WallField, v: number): boolean {
  if (!canEdit(it, field === 'y' ? 'move' : 'resize')) return false;
  const { min, max } = fieldRange(field);
  it[field] = clamp(Math.round(v), min, max);
  return true;
}

/* ---------- Cửa đi, cửa sổ ---------- */

export type OpeningItem = DoorItem | WindowItem;

/** Khoảng cho phép (cm) của vị trí và chiều rộng cửa, trên tường hiện tại của nó. */
export function openingRanges(l: Layout, o: OpeningItem): { pos: { min: number; max: number }; w: { min: number; max: number } } {
  const { minW, margin } = LIMITS.opening;
  const len = wallLength(l, o.wall);
  return {
    pos: { min: margin, max: Math.max(margin, len - o.w - margin) },
    w: { min: minW, max: Math.max(minW, len - 2 * margin) },
  };
}

/**
 * Dời cửa tới tường wall, cách góc pos (cm), bám lưới nếu snap. Cửa luôn nằm gọn trong tường (rộng quá thì thu lại).
 * Trả về true nếu có gì đổi.
 */
export function moveOpening(l: Layout, o: OpeningItem, wall: WallKey, pos: number, snap: boolean): boolean {
  const next = fitOpening({ ...o, wall, pos: snapValue(pos, snap) }, l.W, l.H);
  const changed = next.wall !== o.wall || next.pos !== o.pos || next.w !== o.w;
  o.wall = next.wall;
  o.pos = next.pos;
  o.w = next.w;
  return changed;
}

/** Đổi chiều rộng, giữ mép gần góc; rộng ra mà tràn tường thì dịch cả cửa vào. Trả về true nếu có gì đổi. */
export function setOpeningWidth(l: Layout, o: OpeningItem, w: number): boolean {
  const next = fitOpening({ ...o, w: Math.round(w) }, l.W, l.H);
  const changed = next.pos !== o.pos || next.w !== o.w;
  o.pos = next.pos;
  o.w = next.w;
  return changed;
}

/* ---------- Thêm, xóa cửa ---------- */

/** Số cửa đi hoặc cửa sổ đang có trong phòng. */
export function openingCount(l: Layout, kind: OpeningKind): number {
  return (kind === 'door' ? l.doors : l.windows).length;
}

/** Mỗi phòng có tối đa LIMITS.maxOpeningsPerKind cửa đi và bấy nhiêu cửa sổ. */
export function isOpeningsFull(l: Layout, kind: OpeningKind): boolean {
  return openingCount(l, kind) >= LIMITS.maxOpeningsPerKind;
}

/** Điểm thả cửa mới: trên mặt bằng (cm) hoặc trên một bức tường (s là tâm cửa theo hệ tọa độ mặt đứng, giống món gắn tường). */
export type OpeningDrop = { kind: 'plan'; x: number; y: number } | { kind: 'wall'; wall: WallKey; s: number };

/**
 * Chỗ đặt một cửa rộng w. Có điểm thả thì lấy theo điểm đó (mặt bằng: tường gần nhất, tâm cửa tại điểm thả);
 * không có thì tự tìm chỗ trống: ưu tiên tường prefer nếu còn đủ chỗ, không thì khoảng trống dài nhất ở các tường,
 * đặt giữa khoảng trống đó. Hết chỗ thì đặt giữa tường prefer (hoặc tường trên) và để phần chồng lấn bị báo cam.
 * Trả về pos thô: addOpening bám lưới và kẹp vào tường.
 */
export function openingSpot(l: Layout, w: number, at: OpeningDrop | null, prefer?: WallKey): { wall: WallKey; pos: number } {
  if (at?.kind === 'plan') {
    const wall = nearestWall(l, at);
    return { wall, pos: alongWall(wall, at) - w / 2 };
  }
  if (at?.kind === 'wall') return { wall: at.wall, pos: posFromRange(l, at.wall, w, at.s - w / 2) };

  const { margin } = LIMITS.opening;
  const taken = [...l.doors, ...l.windows];
  /** Khoảng trống dài nhất của một tường còn vừa cửa w, hoặc null. */
  const gapOn = (wall: WallKey): [number, number] | null => {
    const busy = taken.filter((o) => o.wall === wall).sort((a, b) => a.pos - b.pos);
    const gaps: [number, number][] = [];
    let from: number = margin;
    for (const o of busy) {
      if (o.pos > from) gaps.push([from, o.pos]);
      from = Math.max(from, o.pos + o.w);
    }
    const end = wallLength(l, wall) - margin;
    if (end > from) gaps.push([from, end]);
    let best: [number, number] | null = null;
    for (const g of gaps) if (g[1] - g[0] >= w && (!best || g[1] - g[0] > best[1] - best[0])) best = g;
    return best;
  };
  const center = (g: [number, number]): number => (g[0] + g[1] - w) / 2;
  const pg = prefer ? gapOn(prefer) : null;
  if (prefer && pg) return { wall: prefer, pos: center(pg) };
  let best: { wall: WallKey; gap: [number, number] } | null = null;
  for (const wall of ['T', 'R', 'B', 'L'] as const) {
    const g = gapOn(wall);
    if (g && (!best || g[1] - g[0] > best.gap[1] - best.gap[0])) best = { wall, gap: g };
  }
  if (best) return { wall: best.wall, pos: center(best.gap) };
  const wall = prefer ?? 'T';
  return { wall, pos: (wallLength(l, wall) - w) / 2 };
}

/**
 * Thêm một cửa đi hoặc cửa sổ theo loại trong thư viện. Bám lưới nếu snap; cửa luôn nằm gọn trong tường;
 * cửa sổ giữ bậu và chiều cao của loại đó, kẹp theo trần phòng. Trả về cửa vừa thêm để chọn.
 */
export function addOpening(l: Layout, preset: OpeningPreset, wall: WallKey, pos: number, snap: boolean, uid: number): OpeningSel {
  const base = fitOpening({ uid, wall, pos: snapValue(pos, snap), w: preset.w }, l.W, l.H);
  if (preset.kind === 'door') {
    l.doors.push(base);
    return { kind: 'door', uid };
  }
  const win: WindowItem = base;
  if (preset.sill !== undefined) win.sill = clamp(Math.round(preset.sill), 0, Math.max(0, l.ceil - 10));
  if (preset.h !== undefined) win.h = clamp(Math.round(preset.h), 10, Math.max(10, l.ceil - (win.sill ?? 90)));
  l.windows.push(win);
  return { kind: 'win', uid };
}

/** Xóa một cửa đi hoặc cửa sổ. Trả về true nếu đã xóa. */
export function removeOpening(l: Layout, sel: OpeningSel): boolean {
  const list = sel.kind === 'door' ? l.doors : l.windows;
  const next = list.filter((o) => o.uid !== sel.uid);
  if (next.length === list.length) return false;
  if (sel.kind === 'door') l.doors = next as DoorItem[];
  else l.windows = next as WindowItem[];
  return true;
}

/**
 * Bước dịch cửa (cm, có dấu theo chiều của pos) khi bấm phím mũi tên. Trên mặt bằng, tường trên và dưới chạy ngang,
 * tường trái và phải chạy dọc. Trên mặt đứng chỉ có trái, phải; tường dưới và tường trái đảo chiều so với pos.
 * Mũi tên không chạy dọc theo tường thì trả về 0.
 */
export function openingStep(view: 'plan' | 'elev', wall: WallKey, dir: Dir, step: number): number {
  const horizontal = dir === 'left' || dir === 'right';
  const sign = dir === 'left' || dir === 'up' ? -1 : 1;
  if (view === 'elev') {
    if (!horizontal) return 0;
    return wall === 'B' || wall === 'L' ? -sign * step : sign * step;
  }
  const along = wall === 'T' || wall === 'B';
  return along === horizontal ? sign * step : 0;
}

/**
 * Bốn hướng mở cánh, xếp theo vòng quanh ô cửa: bản lề gần góc mở vào, bản lề xa góc mở vào,
 * bản lề xa góc mở ra, bản lề gần góc mở ra. Vòng này đi cùng chiều kim đồng hồ ở tường dưới và trái, ngược chiều ở tường trên và phải.
 */
const DOOR_TURNS: readonly (readonly [DoorHinge, DoorSwing])[] = [
  ['start', 'in'],
  ['end', 'in'],
  ['end', 'out'],
  ['start', 'out'],
];

/** Vị trí của hướng mở cánh hiện tại trong DOOR_TURNS (0 đến 3). */
export function doorTurn(d: DoorDef): number {
  const i = DOOR_TURNS.findIndex(([h, s]) => h === (d.hinge ?? 'start') && s === (d.swing ?? 'in'));
  return i < 0 ? 0 : i;
}

/** Đặt hướng mở cánh. Giá trị mặc định (bản lề gần góc, mở vào) không ghi vào cửa, để file gọn và Hoàn tác so sánh đúng. */
export function setDoorSide(d: DoorItem, hinge: DoorHinge, swing: DoorSwing): void {
  if (hinge === 'end') d.hinge = 'end';
  else delete d.hinge;
  if (swing === 'out') d.swing = 'out';
  else delete d.swing;
}

/** Đổi bên bản lề, giữ nguyên mở vào hay ra. */
export function flipDoorHinge(d: DoorItem): void {
  setDoorSide(d, d.hinge === 'end' ? 'start' : 'end', d.swing ?? 'in');
}

/** Đổi cánh mở vào trong hay ra ngoài, giữ nguyên bên bản lề. */
export function toggleDoorSwing(d: DoorItem): void {
  setDoorSide(d, d.hinge ?? 'start', d.swing === 'out' ? 'in' : 'out');
}

/** Xoay hướng mở cánh một nấc quanh ô cửa. clockwise: theo chiều kim đồng hồ trên mặt bằng, giống nút xoay đồ sàn. */
export function rotateDoor(d: DoorItem, clockwise: boolean): void {
  const forward = clockwise === (d.wall === 'B' || d.wall === 'L');
  const [hinge, swing] = DOOR_TURNS[(doorTurn(d) + (forward ? 1 : 3)) % 4]!;
  setDoorSide(d, hinge, swing);
}

/** Bật hoặc tắt khóa. Trả về trạng thái mới. Món không khóa thì không ghi trường locked, để file gọn. */
export function toggleLock(it: AnyItem): boolean {
  if (it.locked) {
    delete it.locked;
    return false;
  }
  it.locked = true;
  return true;
}

export type ResetScope = 'plan' | 'all' | WallKey;

/**
 * Đưa bản vẽ về bố trí mẫu. plan: đồ sàn, số đo và màu của phòng (đồ gắn tường giữ nguyên).
 * Tên tường: chỉ đồ gắn tường của tường đó. all: cả phòng. Cửa đi và cửa sổ về chỗ cũ theo plan và all.
 */
export function resetTo(l: Layout, fresh: Layout, scope: ResetScope): void {
  if (scope === 'all' || scope === 'plan') {
    if (fresh.rails) l.rails = [...fresh.rails];
    else delete l.rails;
  }
  if (scope === 'all') {
    Object.assign(l, fresh);
  } else if (scope === 'plan') {
    l.items = fresh.items;
    l.floor = fresh.floor;
    l.wall = fresh.wall;
    l.W = fresh.W;
    l.H = fresh.H;
    l.ceil = fresh.ceil;
    l.doors = fresh.doors;
    l.windows = fresh.windows;
  } else {
    l.walls[scope] = fresh.walls[scope];
  }
}

/**
 * Bật hoặc tắt lan can ở một cạnh phòng (cạnh làm lan can thì không xây tường). Danh sách luôn theo thứ tự trên, phải, dưới, trái.
 * Trả về true nếu cạnh đó giờ là lan can.
 */
export function toggleRail(l: Layout, wall: WallKey): boolean {
  const cur = new Set(l.rails ?? []);
  if (cur.has(wall)) cur.delete(wall);
  else cur.add(wall);
  l.rails = WALL_KEYS.filter((w) => cur.has(w));
  return cur.has(wall);
}
