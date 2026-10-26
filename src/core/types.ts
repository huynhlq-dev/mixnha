import type { DoorDef, WallKey, WindowDef } from '../data/schema';
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

/** Cửa đi đã đặt trên tường của một phòng. pos là khoảng cách từ góc tới mép cửa (cm), cùng quy ước với DoorDef. */
export interface DoorItem extends DoorDef {
  /** Mã đếm tạm trong lần mở trang, không đi vào file xuất. */
  uid: number;
}

export interface WindowItem extends WindowDef {
  uid: number;
}

/** Cửa đi hay cửa sổ. Cùng cách gọi với Opening (chỗ mở trên mặt đứng). */
export type OpeningKind = 'door' | 'win';

/** Cửa đi hoặc cửa sổ đang chọn. Tách khỏi Selection vì cửa không phải món: không có tên, màu, khóa hay thư viện. */
export interface OpeningSel {
  kind: OpeningKind;
  uid: number;
}

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
  doors: DoorItem[];
  windows: WindowItem[];
  /** Các cạnh làm lan can thay cho tường (ban công). Không ghi thì theo loại phòng, loại phòng không khai báo thì cả bốn cạnh là tường. */
  rails?: WallKey[];
}

export type Layouts = Record<RoomId, Layout>;

/**
 * Vị trí của từng phòng trong mô hình căn hộ: góc trên trái (cm) theo hệ tọa độ chung của căn, và z là thứ tự lớp khi các phòng
 * chồng lên nhau (z lớn nằm trên, không ghi là 0; cùng z thì phòng đứng sau trong danh sách nằm trên). Phòng chưa có vị trí thì
 * được tự xếp theo lưới (views/apartment.ts). Không phải một phần của bản vẽ phòng nên không đi cùng Hoàn tác của phòng.
 */
export type AptPlan = Partial<Record<RoomId, { x: number; y: number; z?: number }>>;

/** Món đang chọn. */
export interface Selection {
  scope: Scope;
  uid: number;
}

export function isFloorItem(it: AnyItem): it is FloorItem {
  return 'd' in it && 'rot' in it;
}
