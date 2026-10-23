import type { OpeningPreset } from './schema';

/**
 * Các loại cửa đi và cửa sổ trong thư viện. Thứ tự ở đây là thứ tự trong thư viện (cửa đi trước, cửa sổ sau).
 * Thêm loại mới: thêm một dòng vào đây, chạy npm run validate:items. Cửa sổ ghi cả bậu (sill) và chiều cao (h);
 * bậu cộng chiều cao không quá 220 cm để vừa mọi phòng (trần thấp nhất 220 cm).
 */
const DOOR_COLOR = '#C9A27E';
const WINDOW_COLOR = '#BFD7E3';

export const OPENING_PRESETS: readonly OpeningPreset[] = [
  { id: 'door70', kind: 'door', name: 'Cửa vệ sinh', w: 70, color: DOOR_COLOR },
  { id: 'door80', kind: 'door', name: 'Cửa đi', w: 80, color: DOOR_COLOR },
  { id: 'door90', kind: 'door', name: 'Cửa chính', w: 90, color: DOOR_COLOR },
  { id: 'win60', kind: 'win', name: 'Cửa sổ nhỏ', w: 60, sill: 110, h: 60, color: WINDOW_COLOR },
  { id: 'win120', kind: 'win', name: 'Cửa sổ', w: 120, sill: 90, h: 120, color: WINDOW_COLOR },
  { id: 'win180', kind: 'win', name: 'Cửa sổ lớn', w: 180, sill: 90, h: 120, color: WINDOW_COLOR },
  { id: 'win200', kind: 'win', name: 'Cửa kính sát sàn', w: 200, sill: 0, h: 210, color: WINDOW_COLOR },
];
