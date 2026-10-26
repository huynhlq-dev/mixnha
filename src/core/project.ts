import { ROOM_TYPE_IDS, ROOMS, type RoomEntry, type RoomTypeId } from '../data/rooms';
import { freshLayout, type NextUid } from './layout';
import { LIMITS } from './limits';
import type { Registry } from './registry';
import { newRoomEntry, roomDef } from './rooms';
import type { Layouts } from './types';
import { t } from '../i18n';

/** Số phòng mỗi loại. Loại không ghi thì là 0. */
export type RoomCounts = Partial<Record<RoomTypeId, number>>;

/** Việc người dùng chọn khi tạo dự án mới. */
export interface ProjectSpec {
  counts: RoomCounts;
  /** Phòng có sẵn bố trí đồ mẫu của loại phòng (true) hay để trống, chỉ có cửa (false). */
  sample: boolean;
}

/** Số phòng mỗi loại lúc mở trình tạo dự án: căn hộ nhỏ đủ bốn phòng. */
export const DEFAULT_COUNTS: Readonly<Record<RoomTypeId, number>> = { ngu: 1, khach: 1, bep: 1, wc: 1, lamviec: 0, trong: 0, banchong: 0 };

/** Mẫu căn hộ chọn nhanh trong hộp thoại Dự án mới: tên (khóa dịch) và số phòng mỗi loại. Chọn mẫu thì dự án kèm đồ mẫu. */
export interface Template {
  id: string;
  name: string;
  counts: RoomCounts;
}

export const TEMPLATES: readonly Template[] = [
  { id: 'studio', name: 'Studio', counts: { ngu: 1, bep: 1, wc: 1 } },
  { id: 'pn1', name: '1 phòng ngủ', counts: { ngu: 1, khach: 1, bep: 1, wc: 1 } },
  { id: 'pn2', name: '2 phòng ngủ', counts: { ngu: 2, khach: 1, bep: 1, wc: 1, banchong: 1 } },
  { id: 'nhapho', name: 'Nhà phố', counts: { ngu: 3, khach: 1, bep: 1, wc: 2, lamviec: 1, banchong: 1 } },
  { id: 'vanphong', name: 'Phòng làm việc', counts: { lamviec: 2, khach: 1, wc: 1 } },
];

/** Số phòng của một loại, đã làm tròn và kẹp về 0 trở lên (số lạ coi là 0). */
export function countOf(counts: RoomCounts, type: RoomTypeId): number {
  const n = counts[type];
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** Tổng số phòng. */
export function totalRooms(counts: RoomCounts): number {
  return ROOM_TYPE_IDS.reduce((sum, t) => sum + countOf(counts, t), 0);
}

/** Tổng diện tích sàn (m²) theo cỡ mặc định của từng loại. */
export function totalArea(counts: RoomCounts): number {
  return ROOM_TYPE_IDS.reduce((sum, t) => sum + (countOf(counts, t) * ROOMS[t].W * ROOMS[t].H) / 10000, 0);
}

/** Thông báo lỗi nếu chưa tạo được dự án (ít nhất 1, nhiều nhất LIMITS.maxRooms phòng), không thì null. */
export function countsError(counts: RoomCounts): string | null {
  const n = totalRooms(counts);
  if (n < 1) return t('Chọn ít nhất một phòng.');
  if (n > LIMITS.maxRooms) return t('Tối đa {max} phòng, đang chọn {n}.', { max: LIMITS.maxRooms, n });
  return null;
}

/**
 * Danh sách phòng của dự án: theo thứ tự loại phòng trong thư viện (ngủ, khách, bếp, vệ sinh, làm việc, trống), cùng loại thì đánh số
 * (Phòng ngủ, Phòng ngủ 2...). Quá giới hạn thì cắt bớt từ cuối.
 */
export function projectRooms(counts: RoomCounts): RoomEntry[] {
  const rooms: RoomEntry[] = [];
  for (const type of ROOM_TYPE_IDS) {
    for (let i = 0; i < countOf(counts, type) && rooms.length < LIMITS.maxRooms; i++) rooms.push(newRoomEntry(type, rooms));
  }
  return rooms;
}

/** Dựng dự án mới: danh sách phòng và bản vẽ từng phòng (có đồ mẫu hoặc để trống). Chưa chọn phòng nào thì trả về căn hộ mặc định. */
export function buildProject(spec: ProjectSpec, reg: Registry, nextUid: NextUid): { rooms: RoomEntry[]; layouts: Layouts } {
  const rooms = projectRooms(totalRooms(spec.counts) > 0 ? spec.counts : DEFAULT_COUNTS);
  const layouts: Layouts = {};
  for (const entry of rooms) {
    const def = roomDef(entry);
    layouts[entry.id] = freshLayout(spec.sample ? def : { ...def, sample: { floor: [], walls: {} } }, reg, nextUid);
  }
  return { rooms, layouts };
}
