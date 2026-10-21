import type { ItemDef, WallKey } from '../data/schema';
import { clamp, roundDeg, wallLength } from './geometry';
import { canEdit, countItems, makeFloorItem, makeWallItem, snapValue } from './layout';
import { LIMITS } from './limits';
import type { AnyItem, FloorItem, Layout, Scope, Selection, WallItem } from './types';

/**
 * Các thao tác sửa bản vẽ do người dùng bấm (thêm, xoay, dịch, đổi số đo, khóa). Mỗi hàm chỉ sửa dữ liệu, không biết gì về giao diện,
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
 * Tên tường: chỉ đồ gắn tường của tường đó. all: cả phòng.
 */
export function resetTo(l: Layout, fresh: Layout, scope: ResetScope): void {
  if (scope === 'all') {
    Object.assign(l, fresh);
  } else if (scope === 'plan') {
    l.items = fresh.items;
    l.floor = fresh.floor;
    l.wall = fresh.wall;
    l.W = fresh.W;
    l.H = fresh.H;
    l.ceil = fresh.ceil;
  } else {
    l.walls[scope] = fresh.walls[scope];
  }
}
