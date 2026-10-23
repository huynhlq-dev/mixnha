import { normHex } from '../core/color';
import { assignUids, isRoomId, type NextUid } from '../core/layout';
import { roomDef } from '../core/rooms';
import type { Registry } from '../core/registry';
import type { AptPlan, Layouts } from '../core/types';
import { DEFAULT_ROOMS, type RoomEntry, type RoomId } from '../data/rooms';
import type { KV } from './kv';
import { CURRENT_VER, migrate, type RawDoc } from './migrations';
import { cleanText, FIELD_LIMITS, sanitizeApt, sanitizeRoomList, sanitizeSaved } from './sanitize';

/** Khóa lưu trong trình duyệt. Số phiên bản nằm trong nội dung (trường ver), không nằm trong khóa. */
export const STATE_KEY = 'xepnha2d:state';

export interface PenPrefs {
  color: string;
  recent: string[];
}

/** Tên và ghi chú người dùng đã đặt cho bản thiết kế, để điền sẵn vào hộp thoại Xuất. */
export interface SavedMeta {
  name: string;
  note: string;
}

export interface SavedState {
  room: RoomId;
  /** Chỉ gồm các phòng đọc được. Phòng hỏng hoặc thiếu thì để app dùng bố trí mẫu. */
  layouts: Partial<Layouts>;
  pen: PenPrefs | null;
  meta: SavedMeta;
  /** Vị trí các phòng trong mô hình căn hộ; rỗng nghĩa là để tự xếp. */
  apt: AptPlan;
  /** Các phòng của căn hộ theo thứ tự tab. Dữ liệu cũ chưa ghi danh sách thì là bốn phòng mặc định. */
  rooms: RoomEntry[];
}

export function serializeState(room: RoomId, layouts: Layouts, pen: PenPrefs, meta?: SavedMeta, apt?: AptPlan, rooms?: readonly RoomEntry[]): string {
  return JSON.stringify({
    ver: CURRENT_VER,
    room,
    ...(rooms ? { rooms } : {}),
    layouts,
    pen,
    ...(meta && (meta.name || meta.note) ? { meta } : {}),
    ...(apt && Object.keys(apt).length ? { apt } : {}),
  });
}

export function saveState(kv: KV, room: RoomId, layouts: Layouts, pen: PenPrefs, meta?: SavedMeta, apt?: AptPlan, rooms?: readonly RoomEntry[]): boolean {
  return kv.set(STATE_KEY, serializeState(room, layouts, pen, meta, apt, rooms));
}

/**
 * Đọc lại bản vẽ tự lưu. Mỗi phòng được làm sạch như khi nhập file (màu, số đo, món lạ), rồi gán uid mới.
 * Trả về null nếu chưa có gì hoặc dữ liệu hỏng hoàn toàn, khi đó app dùng bố trí mẫu.
 */
export function loadState(kv: KV, reg: Registry, nextUid: NextUid): SavedState | null {
  const raw = kv.get(STATE_KEY);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const { doc } = migrate(parsed as RawDoc);
  const layoutsRaw = doc.layouts;
  if (!layoutsRaw || typeof layoutsRaw !== 'object') return null;

  // dữ liệu cũ chưa ghi danh sách phòng: căn hộ mặc định (bốn phòng đầu, mã trùng với mã đã dùng làm khóa bản vẽ)
  const rooms = sanitizeRoomList(doc.rooms) ?? DEFAULT_ROOMS.map((r) => ({ ...r }));
  const layouts: Partial<Layouts> = {};
  for (const entry of rooms) {
    const l = sanitizeSaved((layoutsRaw as Record<string, unknown>)[entry.id], roomDef(entry), reg);
    if (l) {
      assignUids(l, nextUid);
      layouts[entry.id] = l;
    }
  }
  const room = isRoomId(doc.room) && rooms.some((r) => r.id === doc.room) ? doc.room : rooms[0]!.id;

  let pen: PenPrefs | null = null;
  const p = doc.pen as { color?: unknown; recent?: unknown } | undefined;
  const color = normHex(p?.color);
  if (color) {
    const recent = Array.isArray(p?.recent) ? (p!.recent as unknown[]).map(normHex).filter((c): c is string => !!c).slice(0, 8) : [];
    pen = { color, recent };
  }
  const m = doc.meta as { name?: unknown; note?: unknown } | undefined;
  const meta: SavedMeta = { name: cleanText(m?.name, FIELD_LIMITS.maxName), note: cleanText(m?.note, FIELD_LIMITS.maxNote) };
  return {
    room,
    layouts,
    pen,
    meta,
    apt: sanitizeApt(
      doc.apt,
      rooms.map((r) => r.id),
    ),
    rooms,
  };
}
