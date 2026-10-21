import { normHex } from '../core/color';
import { assignUids, isRoomId, type NextUid } from '../core/layout';
import type { Registry } from '../core/registry';
import type { Layouts } from '../core/types';
import type { RoomId } from '../data/rooms';
import { ROOM_IDS } from '../data/rooms';
import type { KV } from './kv';
import { CURRENT_VER, migrate, type RawDoc } from './migrations';
import { cleanText, FIELD_LIMITS, sanitizeSaved } from './sanitize';

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
}

export function serializeState(room: RoomId, layouts: Layouts, pen: PenPrefs, meta?: SavedMeta): string {
  return JSON.stringify({ ver: CURRENT_VER, room, layouts, pen, ...(meta && (meta.name || meta.note) ? { meta } : {}) });
}

export function saveState(kv: KV, room: RoomId, layouts: Layouts, pen: PenPrefs, meta?: SavedMeta): boolean {
  return kv.set(STATE_KEY, serializeState(room, layouts, pen, meta));
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

  const layouts: Partial<Layouts> = {};
  for (const id of ROOM_IDS) {
    const l = sanitizeSaved((layoutsRaw as Record<string, unknown>)[id], id, reg);
    if (l) {
      assignUids(l, nextUid);
      layouts[id] = l;
    }
  }
  const room = isRoomId(doc.room) ? doc.room : ROOM_IDS[0];

  let pen: PenPrefs | null = null;
  const p = doc.pen as { color?: unknown; recent?: unknown } | undefined;
  const color = normHex(p?.color);
  if (color) {
    const recent = Array.isArray(p?.recent) ? (p!.recent as unknown[]).map(normHex).filter((c): c is string => !!c).slice(0, 8) : [];
    pen = { color, recent };
  }
  const m = doc.meta as { name?: unknown; note?: unknown } | undefined;
  const meta: SavedMeta = { name: cleanText(m?.name, FIELD_LIMITS.maxName), note: cleanText(m?.note, FIELD_LIMITS.maxNote) };
  return { room, layouts, pen, meta };
}
