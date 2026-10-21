import type { ItemDef } from '../schema';

export const BATHROOM: readonly ItemDef[] = [
  { id: 'toilet', name: 'Bồn cầu', cat: 'bathroom', place: 'floor', w: 40, d: 70, h: 75, color: '#E8ECEE', shape: 'toilet', ignoreLane: true, note: 'Chừa ≥ 20 cm hai bên', status: 'live' },
  { id: 'basin', name: 'Lavabo', cat: 'bathroom', place: 'floor', w: 60, d: 45, h: 85, color: '#DDE3E6', ignoreLane: true, status: 'live' },
  { id: 'shower', name: 'Khu tắm đứng', short: 'Tắm', cat: 'bathroom', place: 'floor', w: 90, d: 90, h: 200, color: '#BFD7E3', shape: 'shower', note: 'Tối thiểu 80 x 80 cm', status: 'live' },
];
