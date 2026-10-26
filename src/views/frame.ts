import type { Bounds } from './viewport';

/**
 * Mức của dòng trạng thái: good (đạt, xanh), warn (nên xem lại, vàng: lối đi hẹp), bad (lỗi, cam: chồng lấn, chắn cửa),
 * info (chỉ là hướng dẫn, không phải kết quả kiểm tra).
 */
export type StatusTone = 'good' | 'warn' | 'bad' | 'info';

/** Kết quả vẽ một bản vẽ 2D: nội dung SVG cùng các dòng chữ đi kèm. Mặt bằng và mặt đứng cùng trả về kiểu này. */
export interface Frame {
  /** Khung chứa cả bản vẽ lẫn lề, theo tọa độ bản vẽ (cm). */
  bounds: Bounds;
  aria: string;
  /** Nội dung bên trong thẻ svg. */
  svg: string;
  /** Tên phòng (và tường, nếu đang xem mặt đứng). */
  title: string;
  size: string;
  area: string;
  status: { tone: StatusTone; text: string };
}

/** Lề quanh bản vẽ (cm), đủ chỗ cho đường kích thước và để trên điện thoại còn chỗ chạm kéo cả trang. */
export const MARGIN = 50;
