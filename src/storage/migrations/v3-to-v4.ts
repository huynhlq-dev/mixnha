import type { RawDoc } from './index';

/**
 * Bản 4 ghi thêm vị trí cửa đi và cửa sổ vào từng phòng (trường doors, windows; cửa đi có thêm hinge, swing cho hướng
 * mở cánh, chỉ ghi khi khác mặc định). Bản 3 chưa có các trường này,
 * và khi đọc, phòng thiếu chúng dùng cửa mặc định của phòng, nên nội dung không cần đổi. Tăng số bản để bản cũ
 * (chỉ hiểu tới 3) báo "file mới hơn" thay vì lặng lẽ bỏ mất chỗ đặt cửa.
 */
export function v3ToV4(doc: RawDoc): RawDoc {
  return { ...doc, ver: 4 };
}
