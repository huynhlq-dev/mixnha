import type { Rect, RoomSize } from './geometry';

/** Khoảng cách từ mép món tới bốn bức tường trên mặt bằng (cm). Âm nghĩa là món đang lấn ra ngoài. */
export interface PlanGaps {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** r là khung bao ngang dọc của món (đã tính xoay). */
export function planGaps(r: Rect, R: RoomSize): PlanGaps {
  return { left: r.x0, right: R.W - r.x1, top: r.y0, bottom: R.H - r.y1 };
}

/** Khoảng cách của món gắn tường tới hai đầu tường, sàn và trần (cm). */
export interface WallGaps {
  left: number;
  right: number;
  floor: number;
  ceiling: number;
}

export function wallGaps(r: Rect, len: number, ceil: number): WallGaps {
  return { left: r.x0, right: len - r.x1, floor: r.y0, ceiling: ceil - r.y1 };
}
