import type { ItemDef } from '../schema';

export const DINING: readonly ItemDef[] = [
  { id: 'dine4', name: 'Bàn ăn 4 người', short: 'Bàn ăn', cat: 'dining', place: 'floor', w: 130, d: 80, h: 75, color: '#D8BC8E', shape: 'table', note: 'Mỗi ghế cần ~60 cm để kéo ra', status: 'live' },
  { id: 'chair', name: 'Ghế ăn', short: 'Ghế', cat: 'dining', place: 'floor', w: 45, d: 45, h: 90, color: '#E6D3B0', shape: 'chair', ignoreLane: true, status: 'live' },
  { id: 'fridge', name: 'Tủ lạnh', cat: 'dining', place: 'floor', w: 70, d: 70, h: 175, color: '#C4CCD2', note: 'Chừa hở 5 cm hai bên', status: 'live' },
  { id: 'cook', name: 'Tủ bếp + bếp nấu', short: 'Bếp', cat: 'dining', place: 'floor', w: 180, d: 60, h: 85, color: '#B8BEC4', shape: 'cooker', note: 'Sâu 60 cm là chuẩn', status: 'live' },
  { id: 'wash', name: 'Máy giặt cửa trước', short: 'Máy giặt', cat: 'dining', place: 'floor', w: 60, d: 60, h: 85, color: '#CBD3D9', note: 'Cửa mở thêm ~60 cm', status: 'live' },
];
