import { hexMix, normHex } from '../../core/color';
import type { RawDoc } from './index';

/**
 * Bản 2 vẽ tường đậm rồi làm nhạt khi hiện trên mặt đứng. Từ bản 3, màu tường lưu đúng màu nhìn thấy
 * ở mọi chế độ, nên màu tường cũ được làm nhạt một lần ở đây.
 * Áp dụng cho cả dữ liệu tự lưu (khóa layouts) và file xuất (khóa rooms).
 */
export function v2ToV3(doc: RawDoc): RawDoc {
  const out: RawDoc = { ...doc, ver: 3 };
  for (const key of ['layouts', 'rooms'] as const) {
    const group = doc[key];
    if (!group || typeof group !== 'object') continue;
    const next: Record<string, unknown> = {};
    for (const [room, value] of Object.entries(group as Record<string, unknown>)) {
      const l = value as Record<string, unknown> | null;
      const hex = l && typeof l === 'object' ? normHex(l.wall) : null;
      next[room] = hex ? { ...l, wall: hexMix(hex, 0.82) } : value;
    }
    out[key] = next;
  }
  return out;
}
