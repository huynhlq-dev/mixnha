import { addBox, type ShapeBuilder } from './util';

/** Tủ bếp kèm mặt bếp: thân tủ theo màu món, mặt bếp xám đậm dày 5 cm nhô ra 1 cm mỗi phía. */
export const cooker: ShapeBuilder = ({ g, w, d, h, color }) => {
  const body = Math.max(10, h - 5);
  addBox(g, w, body, d, 0, body / 2, 0, color);
  addBox(g, w + 2, 5, d + 2, 0, body + 2.5, 0, 0x5e6b73);
};
