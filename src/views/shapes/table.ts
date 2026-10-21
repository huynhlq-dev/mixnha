import { addBox, corners, shade, type ShapeBuilder } from './util';

/** Bàn: mặt dày 4 cm ở trên cùng và bốn chân vuông. */
export const table: ShapeBuilder = ({ g, w, d, h, color }) => {
  addBox(g, w, 4, d, 0, h - 2, 0, color);
  corners(w, d, (x, z) => addBox(g, 5, h - 4, 5, x, (h - 4) / 2, z, shade(color, 0.75), { noEdge: true }));
};
