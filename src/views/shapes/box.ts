import { addBox, type ShapeBuilder } from './util';

/** Hình hộp đặc, kiểu mặc định cho món không chọn shape và cho món lạ. */
export const box: ShapeBuilder = ({ g, w, d, h, color }) => {
  addBox(g, w, h, d, 0, h / 2, 0, color);
};
