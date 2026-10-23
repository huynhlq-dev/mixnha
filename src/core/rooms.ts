import { ROOMS, ROOM_TYPE_IDS, type RoomEntry, type RoomId, type RoomTypeId } from '../data/rooms';
import type { RoomDef } from '../data/schema';

/** Mã phòng hợp lệ: chữ thường đứng đầu, rồi chữ thường, số, gạch ngang (ngu, ngu2, phong-con). */
export const ROOM_ID_PATTERN = /^[a-z][a-z0-9-]{0,23}$/;
/** Tên phòng dài nhất (ký tự). */
export const MAX_ROOM_NAME = 40;

export const isRoomTypeId = (v: unknown): v is RoomTypeId => typeof v === 'string' && (ROOM_TYPE_IDS as readonly string[]).includes(v);
export const isRoomIdString = (v: unknown): v is RoomId => typeof v === 'string' && ROOM_ID_PATTERN.test(v);

/** Khai báo của một phòng cụ thể: lấy loại phòng làm gốc (cỡ, cửa, bố trí mẫu) rồi mang mã và tên của phòng đó. */
export function roomDef(entry: RoomEntry): RoomDef {
  return { ...ROOMS[entry.type], id: entry.id, name: entry.name };
}

/**
 * Phòng mới theo loại. Mã là mã loại, trùng thì thêm số (ngu, ngu2, ngu3...). Tên là tên loại, trùng thì thêm số
 * (Phòng ngủ, Phòng ngủ 2...). Số là số nhỏ nhất từ 2 mà chưa ai dùng.
 */
export function newRoomEntry(type: RoomTypeId, rooms: readonly RoomEntry[]): RoomEntry {
  const ids = new Set(rooms.map((r) => r.id));
  const names = new Set(rooms.map((r) => r.name));
  const base = ROOMS[type].name;
  let id: string = type;
  let name: string = base;
  for (let n = 2; ids.has(id) || names.has(name); n++) {
    id = `${type}${n}`;
    name = `${base} ${n}`;
  }
  return { id, type, name };
}

/** Mã đi theo khi bấm hoặc kéo một loại phòng trong thư viện: "room:ngu". Không phải mã loại phòng thì null. */
export const roomDragId = (type: RoomTypeId): string => `room:${type}`;
export function roomTypeFromDragId(id: string): RoomTypeId | null {
  if (!id.startsWith('room:')) return null;
  const t = id.slice(5);
  return isRoomTypeId(t) ? t : null;
}
