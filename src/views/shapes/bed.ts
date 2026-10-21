import { addBox, shade, type ShapeBuilder } from './util';

/** Giường: khung, nệm, đầu giường ở phía sau (-z) và gối (một hoặc hai cái tùy chiều rộng). */
export const bed: ShapeBuilder = ({ g, w, d, color }) => {
  addBox(g, w, 22, d, 0, 11, 0, shade(color, 0.85));
  addBox(g, w - 6, 18, d - 12, 0, 31, 6, 0xf2f0ea);
  addBox(g, w, 62, 6, 0, 31, -d / 2 + 3, shade(color, 0.7));
  const n = w > 130 ? 2 : 1;
  const pw = (w - 20) / n - 6;
  for (let i = 0; i < n; i++) addBox(g, pw, 9, 32, (i - (n - 1) / 2) * (pw + 6), 44, -d / 2 + 28, 0xffffff);
};
