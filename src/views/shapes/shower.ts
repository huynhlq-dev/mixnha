import { addBox, type ShapeBuilder } from './util';

/** Khu tắm đứng: khay thấp và vách kính trong suốt cao tới chiều cao món. */
export const shower: ShapeBuilder = ({ g, w, d, h }) => {
  addBox(g, w, 8, d, 0, 4, 0, 0xe8ecee);
  addBox(g, w, h - 8, d, 0, 8 + (h - 8) / 2, 0, 0xbfd7e3, { opacity: 0.3, noEdge: true });
};
