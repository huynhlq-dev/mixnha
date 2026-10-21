import type { ItemDef } from '../schema';

export const SLEEPING: readonly ItemDef[] = [
  { id: 'bed2', name: 'Giường đôi', short: 'Giường', cat: 'sleeping', place: 'floor', w: 170, d: 210, h: 50, color: '#8FB4D9', shape: 'bed', note: 'Khung giường cho nệm 1m6 x 2m. Chừa ≥ 60 cm mỗi bên', status: 'live' },
  { id: 'bed1', name: 'Giường đơn', short: 'Giường', cat: 'sleeping', place: 'floor', w: 110, d: 210, h: 50, color: '#A9C6E3', shape: 'bed', note: 'Khung giường cho nệm 1m x 2m', status: 'live' },
  { id: 'ward2', name: 'Tủ quần áo 2 cánh', short: 'Tủ áo', cat: 'sleeping', place: 'floor', w: 120, d: 55, h: 200, color: '#C9A27E', note: 'Cánh mở cần thêm ~50 cm phía trước', status: 'live' },
  { id: 'ward4', name: 'Tủ quần áo 4 cánh', short: 'Tủ áo', cat: 'sleeping', place: 'floor', w: 220, d: 60, h: 220, color: '#BF9670', note: 'Loại âm tường thường sâu 60 cm', status: 'live' },
  { id: 'night', name: 'Táp đầu giường', short: 'Táp', cat: 'sleeping', place: 'floor', w: 45, d: 40, h: 50, color: '#D6B89A', ignoreLane: true, status: 'live' },
  { id: 'dress', name: 'Bàn trang điểm', short: 'Trang điểm', cat: 'sleeping', place: 'floor', w: 100, d: 45, h: 75, color: '#E3B7A0', shape: 'table', status: 'live' },
];
