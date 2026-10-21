import type { CategoryDef } from './schema';

/** Thứ tự ở đây là thứ tự nhóm trong thư viện. */
export const CATEGORIES: readonly CategoryDef[] = [
  { id: 'sleeping', name: 'Ngủ', place: 'floor' },
  { id: 'living', name: 'Tiếp khách', place: 'floor' },
  { id: 'dining', name: 'Ăn uống & bếp', place: 'floor' },
  { id: 'work', name: 'Làm việc', place: 'floor' },
  { id: 'bathroom', name: 'Vệ sinh', place: 'floor' },
  { id: 'wall-kitchen', name: 'Bếp (nhìn thẳng)', place: 'wall', label3d: 'Gắn tường: bếp' },
  { id: 'wall-hang', name: 'Treo tường', place: 'wall', label3d: 'Gắn tường: treo' },
  { id: 'wall-tall', name: 'Đứng sàn', place: 'wall', label3d: 'Gắn tường: tủ cao' },
];
