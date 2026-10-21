/** Giới hạn cho phép của dữ liệu nhập tay và dữ liệu đọc từ file. Một chỗ duy nhất, dùng cho cả giao diện và kiểm tra file. */
export const LIMITS = {
  roomW: { min: 150, max: 1500 },
  roomH: { min: 150, max: 1500 },
  ceil: { min: 220, max: 450 },
  /** Rộng, sâu hoặc cao của món (cm). */
  itemSize: { min: 10, max: 600 },
  /** Độ cao mép dưới của món gắn tường (cm). */
  itemY: { min: 0, max: 400 },
  /** Số món tối đa trong một phòng (đồ sàn và đồ tường cộng lại). File nhiều hơn mức này không nhập được. */
  maxItemsPerRoom: 500,
  /** Số bước Hoàn tác nhớ cho mỗi phòng. */
  undoSteps: 100,
  /** Lưới bám (cm). */
  grid: 5,
} as const;

export type RoomDimKey = 'W' | 'H' | 'ceil';

export const ROOM_DIM_LIMITS: Readonly<Record<RoomDimKey, { min: number; max: number }>> = {
  W: LIMITS.roomW,
  H: LIMITS.roomH,
  ceil: LIMITS.ceil,
};
