import type { ItemDef, RoomDef, WallKey } from '../data/schema';
import { FLOOR_COLORS, WALL_COLORS } from '../data/palettes';
import { WALL_KEYS } from '../data/walls';
import type { RoomId } from '../data/rooms';
import { normHex } from './color';
import { clamp, wallLength } from './geometry';
import { LIMITS, ROOM_DIM_LIMITS, type RoomDimKey } from './limits';
import type { Registry } from './registry';
import { fitOpening } from './room';
import { isRoomIdString } from './rooms';
import type { AnyItem, DoorItem, FloorItem, Layout, Layouts, OpeningSel, Scope, Selection, WallItem, WindowItem } from './types';

/** Chiều cao dùng khi món không có trong thư viện và file cũng không ghi. */
export const DEFAULT_FLOOR_HEIGHT = 50;
/** Độ nhô ra khỏi tường khi món gắn tường không có trong thư viện và file không ghi. */
export const DEFAULT_WALL_DEPTH = 20;

export type NextUid = () => number;

/** Màu trong bản vẽ luôn là #rrggbb viết thường, để so sánh màu với nhau không phải lo hoa thường. */
const lower = (hex: string): string => normHex(hex) ?? hex;

export function makeFloorItem(def: ItemDef, x: number, y: number, rot: number, color: string | undefined, uid: number): FloorItem {
  return { uid, id: def.id, name: def.name, w: def.w, d: def.d, x, y, rot, color: lower(color ?? def.color), z: def.layer === 'under' ? 0 : 1 };
}

export function makeWallItem(def: ItemDef, s: number, y: number | undefined, uid: number): WallItem {
  return { uid, id: def.id, name: def.name, w: def.w, h: def.h, x: s, y: y ?? def.y ?? 0, color: lower(def.color) };
}

/** Bố trí mẫu của một phòng, đúng kích thước và màu mặc định. */
export function freshLayout(room: RoomDef, reg: Registry, nextUid: NextUid): Layout {
  const walls: Record<WallKey, WallItem[]> = { T: [], R: [], B: [], L: [] };
  for (const wk of WALL_KEYS) {
    for (const [id, s, y] of room.sample.walls[wk] ?? []) {
      const def = reg.get(id);
      if (def && def.place === 'wall') walls[wk].push(makeWallItem(def, s, y, nextUid()));
    }
  }
  const items: FloorItem[] = [];
  for (const [id, x, y, rot, color] of room.sample.floor) {
    const def = reg.get(id);
    if (def && def.place === 'floor') items.push(makeFloorItem(def, x, y, rot, color, nextUid()));
  }
  return {
    W: room.W,
    H: room.H,
    ceil: room.ceil,
    floor: lower(FLOOR_COLORS[room.floor]?.hex ?? FLOOR_COLORS[0]!.hex),
    wall: lower(WALL_COLORS[0]!.hex),
    items,
    walls,
    doors: room.doors.map((d) => ({ ...d, uid: nextUid() })),
    windows: room.windows.map((d) => ({ ...d, uid: nextUid() })),
    ...(room.rails ? { rails: [...room.rails] } : {}),
  };
}

/** Danh sách món thật sự (không phải bản sao) theo phạm vi. */
export function listOf(layout: Layout, scope: Scope): AnyItem[] {
  return scope === 'floor' ? layout.items : layout.walls[scope];
}

export function setList(layout: Layout, scope: Scope, list: AnyItem[]): void {
  if (scope === 'floor') layout.items = list as FloorItem[];
  else layout.walls[scope] = list as WallItem[];
}

export function findItem(layout: Layout, sel: Selection | null): AnyItem | undefined {
  if (!sel) return undefined;
  return listOf(layout, sel.scope).find((i) => i.uid === sel.uid);
}

/** Cửa đi hoặc cửa sổ đang chọn, nếu còn trong bản vẽ. */
export function findOpening(layout: Layout, sel: OpeningSel | null): DoorItem | WindowItem | undefined {
  if (!sel) return undefined;
  return (sel.kind === 'door' ? layout.doors : layout.windows).find((o) => o.uid === sel.uid);
}

export function maxUid(layouts: Partial<Layouts>): number {
  let m = 0;
  for (const l of Object.values(layouts)) {
    if (!l) continue;
    for (const i of l.items) m = Math.max(m, i.uid);
    for (const w of WALL_KEYS) for (const i of l.walls[w]) m = Math.max(m, i.uid);
    for (const o of [...l.doors, ...l.windows]) m = Math.max(m, o.uid);
  }
  return m;
}

/** Gán mã uid mới cho mọi món, cửa đi và cửa sổ của một phòng (khi đọc từ bộ nhớ hoặc từ file, nơi chúng chưa có mã). */
export function assignUids(l: Layout, nextUid: NextUid): void {
  for (const i of l.items) i.uid = nextUid();
  for (const w of WALL_KEYS) for (const i of l.walls[w]) i.uid = nextUid();
  for (const o of [...l.doors, ...l.windows]) o.uid = nextUid();
}

export function countItems(l: Layout): number {
  return l.items.length + WALL_KEYS.reduce((n, w) => n + l.walls[w].length, 0);
}

/** Chiều cao thật của món đặt sàn: từ thư viện, rồi đến trường h của chính món, rồi mặc định. */
export function floorHeight(it: FloorItem, reg: Registry): number {
  return reg.resolve(it.id)?.h ?? it.h ?? DEFAULT_FLOOR_HEIGHT;
}

/** Độ nhô ra khỏi tường của món gắn tường. */
export function wallDepth(it: WallItem, reg: Registry): number {
  return reg.resolve(it.id)?.d ?? it.d ?? DEFAULT_WALL_DEPTH;
}

/** Món có trong thư viện (kể cả đã thay thế) hay là món lạ do file đưa vào. */
export function isCustom(it: AnyItem, reg: Registry): boolean {
  return !reg.resolve(it.id);
}

/** Cấu trúc tối thiểu để dùng được. Dữ liệu hỏng thì bỏ, dùng bố trí mẫu. */
export function isUsableLayout(l: unknown): l is Layout {
  if (!l || typeof l !== 'object') return false;
  const x = l as Partial<Layout>;
  return (
    Array.isArray(x.items) &&
    typeof x.floor === 'string' &&
    typeof x.wall === 'string' &&
    Number(x.W) > 0 &&
    Number(x.H) > 0 &&
    Number(x.ceil) > 0 &&
    !!x.walls &&
    WALL_KEYS.every((w) => Array.isArray(x.walls![w]))
  );
}

export function cloneLayout(l: Layout): Layout {
  return JSON.parse(JSON.stringify(l)) as Layout;
}

export function isRoomId(v: unknown): v is RoomId {
  return isRoomIdString(v);
}

/* ---------- Khóa món ---------- */

export type EditOp = 'move' | 'rotate' | 'resize' | 'delete' | 'color';

/**
 * Chỗ duy nhất quyết định món có được sửa hay không. Món đã khóa chỉ cho đổi màu.
 * Mọi thao tác sửa (kéo, phím, nút, ô số, 3D) đều hỏi qua đây.
 */
export function canEdit(it: AnyItem | undefined | null, op: EditOp): boolean {
  if (!it) return false;
  return op === 'color' || !it.locked;
}

/* ---------- Thao tác trên bố trí ---------- */

export function snapValue(v: number, on: boolean): number {
  return on ? Math.round(v / LIMITS.grid) * LIMITS.grid : Math.round(v);
}

/** Đổi kích thước phòng. Giá trị kẹp trong khoảng cho phép, món (cả đồ gắn tường, cao không quá trần) và cửa nằm ngoài phòng mới thì kéo vào mép. Trả về giá trị thực tế đã dùng. */
export function setRoomDim(l: Layout, key: RoomDimKey, v: number): number {
  const { min, max } = ROOM_DIM_LIMITS[key];
  const val = clamp(Math.round(v), min, max);
  l[key] = val;
  for (const i of l.items) {
    i.x = Math.min(i.x, l.W);
    i.y = Math.min(i.y, l.H);
  }
  for (const o of [...l.doors, ...l.windows]) Object.assign(o, fitOpening(o, l.W, l.H));
  // đồ gắn tường: tâm vẫn nằm trong tường mới, và đỉnh không vượt trần mới
  for (const wl of WALL_KEYS) {
    const len = wl === 'T' || wl === 'B' ? l.W : l.H;
    for (const it of l.walls[wl]) {
      it.x = Math.min(it.x, len);
      it.y = Math.min(it.y, Math.max(0, l.ceil - it.h));
    }
  }
  return val;
}

/** Món đã sao chép (Ctrl+C): bản chụp của món cùng nơi nó nằm (sàn hoặc cạnh tường). */
export interface Clip {
  scope: Scope;
  item: AnyItem;
}

/** Sao chép một món vào bộ nhớ tạm. Bản chụp độc lập, sửa hay xóa món gốc sau đó không ảnh hưởng. */
export function copyItem(l: Layout, sel: Selection): Clip | null {
  const src = findItem(l, sel);
  return src ? { scope: sel.scope, item: JSON.parse(JSON.stringify(src)) as AnyItem } : null;
}

/**
 * Dán món đã sao chép vào bố trí này (có thể là phòng khác), lệch 20 cm mỗi lần dán liền nhau (nth = 1, 2, ...) và kẹp trong phòng.
 * Bản dán không khóa. Đồ gắn tường dán lên đúng cạnh tường cũ của phòng này.
 */
export function pasteItem(l: Layout, clip: Clip, nextUid: NextUid, nth = 1): Selection | null {
  const copy = JSON.parse(JSON.stringify(clip.item)) as AnyItem;
  copy.uid = nextUid();
  delete copy.locked;
  const off = 20 * nth;
  if (clip.scope === 'floor') {
    const f = copy as FloorItem;
    f.x = clamp(f.x + off, 0, l.W);
    f.y = clamp(f.y + off, 0, l.H);
  } else {
    const w = copy as WallItem;
    w.x = clamp(w.x + off, 0, wallLength(l, clip.scope));
    w.y = clamp(w.y, 0, Math.max(0, l.ceil - w.h));
  }
  listOf(l, clip.scope).push(copy);
  return { scope: clip.scope, uid: copy.uid };
}

/** Nhân đôi một món, lệch 20 cm. Món bản sao không khóa. */
export function duplicateItem(l: Layout, sel: Selection, nextUid: NextUid): Selection | null {
  const src = findItem(l, sel);
  if (!src) return null;
  const copy = JSON.parse(JSON.stringify(src)) as AnyItem;
  copy.uid = nextUid();
  delete copy.locked;
  copy.x += 20;
  if (sel.scope === 'floor') (copy as FloorItem).y += 20;
  else copy.y = Math.max(0, copy.y);
  listOf(l, sel.scope).push(copy);
  return { scope: sel.scope, uid: copy.uid };
}

/** Xóa một món. Món đã khóa thì giữ lại. Trả về true nếu đã xóa. */
export function removeItem(l: Layout, sel: Selection): boolean {
  const list = listOf(l, sel.scope);
  const it = list.find((i) => i.uid === sel.uid);
  if (!it || !canEdit(it, 'delete')) return false;
  setList(l, sel.scope, list.filter((i) => i.uid !== sel.uid));
  return true;
}

/** Xóa hàng loạt, bỏ qua món đã khóa. Trả về số món đã xóa. */
export function clearScope(l: Layout, scope: Scope): number {
  const list = listOf(l, scope);
  const keep = list.filter((i) => !canEdit(i, 'delete'));
  setList(l, scope, keep);
  return list.length - keep.length;
}

export function clearAll(l: Layout): number {
  let n = clearScope(l, 'floor');
  for (const w of WALL_KEYS) n += clearScope(l, w);
  return n;
}
