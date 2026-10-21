import type { ItemDef } from '../schema';

export const LIVING: readonly ItemDef[] = [
  { id: 'sofa3', name: 'Sofa 3 chỗ', short: 'Sofa', cat: 'living', place: 'floor', w: 210, d: 90, h: 85, color: '#7E9BB5', shape: 'sofa', note: 'Loại phổ thông 200–220 cm', status: 'live' },
  { id: 'arm', name: 'Ghế bành đơn', short: 'Ghế bành', cat: 'living', place: 'floor', w: 80, d: 80, h: 85, color: '#9DB5C9', shape: 'sofa', status: 'live' },
  { id: 'coffee', name: 'Bàn trà', cat: 'living', place: 'floor', w: 100, d: 50, h: 40, color: '#D4B483', shape: 'table', ignoreLane: true, note: 'Cách sofa 40–45 cm', status: 'live' },
  { id: 'tv', name: 'Kệ TV', cat: 'living', place: 'floor', w: 180, d: 40, h: 50, color: '#A38468', note: 'Xem TV cách ≥ 2,5 m', status: 'live' },
  { id: 'rug', name: 'Thảm trải sàn', short: 'Thảm', cat: 'living', place: 'floor', w: 200, d: 140, h: 2, color: '#D9CDB8', layer: 'under', ignoreLane: true, note: 'Nằm dưới đồ khác', status: 'live' },
  { id: 'shoe', name: 'Tủ giày', cat: 'living', place: 'floor', w: 100, d: 35, h: 100, color: '#B79C84', status: 'live' },
];
