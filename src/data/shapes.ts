/**
 * Các kiểu vẽ 3D có sẵn. Món chọn kiểu qua trường `shape` trong khai báo.
 * Muốn thêm kiểu mới: thêm tên vào đây, rồi viết hàm dựng trong views/shapes/.
 * (TypeScript sẽ báo lỗi nếu có tên ở đây mà chưa có hàm dựng.)
 */
export const SHAPE_IDS = ['box', 'bed', 'sofa', 'chair', 'table', 'toilet', 'cooker', 'shower'] as const;
export type ShapeId = (typeof SHAPE_IDS)[number];
