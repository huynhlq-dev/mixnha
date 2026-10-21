import { addBox, shade, type ShapeBuilder } from './util';

/** Sofa và ghế bành: đế, đệm ngồi, lưng tựa ở phía sau (-z), hai tay vịn. Tay vịn rộng hơn khi sofa dài. */
export const sofa: ShapeBuilder = ({ g, w, d, color }) => {
  const arm = Math.min(18, Math.max(12, w * 0.09));
  addBox(g, w, 36, d, 0, 18, 0, shade(color, 0.8));
  addBox(g, w - arm * 2 - 2, 12, d - 28, 0, 42, 8, color);
  addBox(g, w, 52, 22, 0, 60, -d / 2 + 11, shade(color, 0.9));
  addBox(g, arm, 58, d, -(w / 2 - arm / 2), 29, 0, shade(color, 0.85));
  addBox(g, arm, 58, d, w / 2 - arm / 2, 29, 0, shade(color, 0.85));
};
