import type { ShapeId } from './shapes';

/**
 * Kiểu dữ liệu cho phần khai báo (data/). File này chỉ có kiểu, không có logic và không import gì ngoài thư mục data.
 * Mọi kích thước tính bằng cm.
 */

/** Bốn bức tường nhìn từ trên xuống: T trên, R phải, B dưới, L trái. */
export type WallKey = 'T' | 'R' | 'B' | 'L';

/** "floor": đặt sàn. "wall": gắn tường, nhìn ở mặt đứng. */
export type Place = 'floor' | 'wall';

/**
 * draft: đang làm, chỉ hiện ở trang gallery.
 * live: đã đưa lên, người dùng thấy trong thư viện.
 * retired: ngừng dùng. Bản vẽ cũ vẫn mở được nhờ replacedBy.
 */
export type ItemStatus = 'draft' | 'live' | 'retired';

export interface CategoryDef {
  /** Mã nhóm, chữ thường và gạch ngang. Không đổi sau khi đã đưa lên. */
  id: string;
  name: string;
  /** Nhóm này chứa đồ sàn hay đồ gắn tường. */
  place: Place;
  /** Tên hiện ở chế độ 3D, nơi đồ sàn và đồ tường nằm chung một thư viện. */
  label3d?: string;
}

export interface ItemDef {
  /** Duy nhất, không bao giờ đổi, chữ thường, số, gạch ngang. */
  id: string;
  name: string;
  /** Tên ngắn ghi lên món khi món quá hẹp để ghi tên đầy đủ. Không quá 10 ký tự. */
  short?: string;
  /** Mã nhóm, phải có trong categories.ts. */
  cat: string;
  place: Place;
  /** Kích thước ngoài cùng (cm). Sàn: rộng, sâu, cao. Tường: rộng, nhô ra khỏi tường, cao. */
  w: number;
  d: number;
  h: number;
  /** Chỉ đồ gắn tường: độ cao mép dưới tính từ sàn (cm). */
  y?: number;
  /** Màu mặc định (hex 6 ký tự). Người dùng đổi được. */
  color: string;
  /** Kiểu vẽ 3D, xem views/shapes. Không ghi thì là hình hộp. */
  shape?: ShapeId;
  /** "under": trải dưới các món khác, không tính chồng lấn (thảm). Chỉ đồ sàn. */
  layer?: 'under';
  /** Món nhỏ hoặc bỏ qua được, không tính vào phân tích lối đi. Chỉ đồ sàn. */
  ignoreLane?: boolean;
  /** Lời khuyên thực tế, hiện trong bảng thuộc tính. */
  note?: string;
  status: ItemStatus;
  /** Với món retired: món mới thay vào khi mở bản vẽ cũ. */
  replacedBy?: string;
}

export interface DoorDef {
  wall: WallKey;
  /** Khoảng cách từ góc (cm) tới mép cửa. */
  pos: number;
  w: number;
}

export interface WindowDef extends DoorDef {
  /** Độ cao bậu cửa sổ (cm), mặc định 90. */
  sill?: number;
  /** Chiều cao cửa sổ (cm), mặc định 120. */
  h?: number;
}

/** [id món, x, y, góc xoay, màu (không bắt buộc)]. x, y là tâm món. */
export type SampleFloor = [id: string, x: number, y: number, rot: number, color?: string];
/** [id món, vị trí dọc tường, độ cao mép dưới (không bắt buộc, mặc định theo khai báo món)]. */
export type SampleWall = [id: string, s: number, y?: number];

export interface RoomGuide {
  /** Độ cao so với sàn (cm). */
  y: number;
  label: string;
}

export interface RoomDef {
  id: string;
  name: string;
  W: number;
  H: number;
  ceil: number;
  /** Chỉ số màu sàn mặc định trong FLOOR_COLORS. */
  floor: number;
  doors: DoorDef[];
  windows: WindowDef[];
  /** Vạch tham chiếu trên mặt đứng, ví dụ mặt bếp cao 85 cm. */
  guides?: RoomGuide[];
  /** Bố trí mẫu. */
  sample: { floor: SampleFloor[]; walls: Partial<Record<WallKey, SampleWall[]>> };
}

export interface NamedColor {
  hex: string;
  name: string;
}
