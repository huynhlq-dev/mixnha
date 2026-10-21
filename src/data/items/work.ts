import type { ItemDef } from '../schema';

export const WORK: readonly ItemDef[] = [
  { id: 'desk', name: 'Bàn làm việc', short: 'Làm việc', cat: 'work', place: 'floor', w: 120, d: 60, h: 75, color: '#CDB08A', shape: 'table', status: 'live' },
  { id: 'swivel', name: 'Ghế xoay', short: 'Ghế', cat: 'work', place: 'floor', w: 55, d: 55, h: 95, color: '#6B7A8F', shape: 'chair', ignoreLane: true, status: 'live' },
  { id: 'shelf', name: 'Kệ sách', cat: 'work', place: 'floor', w: 80, d: 30, h: 180, color: '#B89B7A', status: 'live' },
];
