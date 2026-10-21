import type { ItemDef } from '../schema';

/**
 * Đồ gắn tường, nhìn ở mặt đứng. w: rộng dọc tường, h: cao, d: nhô ra khỏi tường (dùng cho 3D),
 * y: độ cao mép dưới tính từ sàn.
 */
export const WALL: readonly ItemDef[] = [
  // Bếp nhìn thẳng
  { id: 'cabL60', name: 'Tủ bếp dưới 60', short: 'Tủ dưới', cat: 'wall-kitchen', place: 'wall', w: 60, d: 60, h: 85, y: 0, color: '#C9A27E', note: 'Cao 85 cm gồm mặt đá', status: 'live' },
  { id: 'cabL80', name: 'Tủ bếp dưới 80', short: 'Tủ dưới', cat: 'wall-kitchen', place: 'wall', w: 80, d: 60, h: 85, y: 0, color: '#C9A27E', status: 'live' },
  { id: 'sinkc', name: 'Chậu rửa + tủ', short: 'Chậu rửa', cat: 'wall-kitchen', place: 'wall', w: 80, d: 60, h: 85, y: 0, color: '#AEB9BF', status: 'live' },
  { id: 'hobc', name: 'Bếp âm + tủ', short: 'Bếp âm', cat: 'wall-kitchen', place: 'wall', w: 60, d: 60, h: 85, y: 0, color: '#8E9AA3', status: 'live' },
  { id: 'cabU60', name: 'Tủ bếp trên 60', short: 'Tủ trên', cat: 'wall-kitchen', place: 'wall', w: 60, d: 35, h: 70, y: 145, color: '#D6B89A', note: 'Mép dưới cách mặt bếp 60 cm', status: 'live' },
  { id: 'cabU80', name: 'Tủ bếp trên 80', short: 'Tủ trên', cat: 'wall-kitchen', place: 'wall', w: 80, d: 35, h: 70, y: 145, color: '#D6B89A', status: 'live' },
  { id: 'hood', name: 'Máy hút mùi', short: 'Hút mùi', cat: 'wall-kitchen', place: 'wall', w: 60, d: 45, h: 60, y: 150, color: '#9AA5AD', note: 'Cách mặt bếp 65 cm', status: 'live' },
  { id: 'micro', name: 'Lò vi sóng', short: 'Vi sóng', cat: 'wall-kitchen', place: 'wall', w: 50, d: 35, h: 30, y: 85, color: '#6B7A8F', note: 'Đặt trên mặt bếp', status: 'live' },
  { id: 'fridgec', name: 'Tủ lạnh', cat: 'wall-kitchen', place: 'wall', w: 70, d: 70, h: 175, y: 0, color: '#C4CCD2', status: 'live' },
  // Treo tường
  { id: 'tvw', name: 'Tivi treo tường 55"', short: 'Tivi', cat: 'wall-hang', place: 'wall', w: 125, d: 6, h: 72, y: 100, color: '#2B3A36', note: 'Tâm màn hình ngang tầm mắt khi ngồi', status: 'live' },
  { id: 'art', name: 'Tranh treo', short: 'Tranh', cat: 'wall-hang', place: 'wall', w: 60, d: 3, h: 80, y: 120, color: '#E3B7A0', note: 'Tâm tranh cao khoảng 160 cm', status: 'live' },
  { id: 'mirror', name: 'Gương', cat: 'wall-hang', place: 'wall', w: 60, d: 2, h: 80, y: 110, color: '#CFE3EA', status: 'live' },
  { id: 'shelfw', name: 'Kệ treo tường', short: 'Kệ', cat: 'wall-hang', place: 'wall', w: 80, d: 20, h: 25, y: 140, color: '#B89B7A', status: 'live' },
  { id: 'ac', name: 'Điều hòa', cat: 'wall-hang', place: 'wall', w: 90, d: 20, h: 30, y: 220, color: '#E8ECEE', note: 'Cách trần ≥ 15 cm', status: 'live' },
  // Đứng sàn, xếp áp tường
  { id: 'wardw', name: 'Tủ quần áo', short: 'Tủ áo', cat: 'wall-tall', place: 'wall', w: 120, d: 55, h: 220, y: 0, color: '#BF9670', status: 'live' },
  { id: 'bookw', name: 'Kệ sách', cat: 'wall-tall', place: 'wall', w: 80, d: 30, h: 180, y: 0, color: '#B89B7A', status: 'live' },
];
