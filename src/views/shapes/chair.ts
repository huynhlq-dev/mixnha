import { addBox, corners, shade, type ShapeBuilder } from './util';

/** Ghế: mặt ngồi cao 43 cm, lưng tựa ở phía sau (-z) lên tới chiều cao món, bốn chân. */
export const chair: ShapeBuilder = ({ g, w, d, h, color }) => {
  const back = Math.max(10, h - 48);
  addBox(g, w, 5, d, 0, 43, 0, color);
  addBox(g, w, back, 4, 0, 45.5 + back / 2, -d / 2 + 2, color);
  corners(w, d, (x, z) => addBox(g, 4, 41, 4, x, 20.5, z, shade(color, 0.7), { noEdge: true }));
};
