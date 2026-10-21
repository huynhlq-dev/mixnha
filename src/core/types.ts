import type { WallKey } from '../data/schema';
import type { RoomId } from '../data/rooms';

/** Món đặt sàn đã đặt vào bản vẽ. x, y là tâm (cm), rot là góc xoay (độ). */
export interface FloorItem {
  /** Mã đếm tạm trong lần mở trang, không đi vào file xuất. */
  uid: number;
  /** Mã món trong thư viện. Món lạ (không còn trong thư viện) giữ nguyên mã cũ. */
  id: string;
  name: string;
  w: number;
  d: number;
  x: number;
  y: number;
  rot: number;
  color: string;
  /** Lớp vẽ: 0 trải dưới sàn như thảm, 1 món thường. */
  z: 0 | 1;
  /** Chiều cao (cm). Chỉ ghi cho món không có trong thư viện, món có sẵn lấy từ thư viện. */
  h?: number;
  locked?: boolean;
}

/** Món gắn tường. x là tâm dọc tường, y là độ cao mép dưới (cm). */
export interface WallItem {
  uid: number;
  id: string;
  name: string;
  w: number;
  h: number;
  x: number;
  y: number;
  color: string;
  /** Độ nhô ra khỏi tường (cm). Chỉ ghi cho món không có trong thư viện. */
  d?: number;
  locked?: boolean;
}

export type AnyItem = FloorItem | WallItem;

/** Danh sách món nào: "floor" là đồ sàn, còn lại là đồ gắn tường theo từng tường. */
export type Scope = 'floor' | WallKey;

export interface Layout {
  W: number;
  H: number;
  ceil: number;
  floor: string;
  wall: string;
  items: FloorItem[];
  walls: Record<WallKey, WallItem[]>;
}

export type Layouts = Record<RoomId, Layout>;

/** Món đang chọn. */
export interface Selection {
  scope: Scope;
  uid: number;
}

export function isFloorItem(it: AnyItem): it is FloorItem {
  return 'd' in it && 'rot' in it;
}
