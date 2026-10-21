import { addBox, type ShapeBuilder } from './util';

/** Bồn cầu: thân thấp ở phía trước, két nước cao ở phía sau (-z). Màu trắng sứ, không theo màu món. */
export const toilet: ShapeBuilder = ({ g, w, d }) => {
  addBox(g, w * 0.9, 38, d - 16, 0, 19, 8, 0xf4f6f7);
  addBox(g, w * 0.95, 40, 16, 0, 55, -d / 2 + 8, 0xf4f6f7);
};
