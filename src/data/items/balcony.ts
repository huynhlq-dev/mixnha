import type { ItemDef } from '../schema';

export const BALCONY: readonly ItemDef[] = [
  { id: 'plant', name: 'Chậu cây lớn', short: 'Cây', cat: 'balcony', place: 'floor', w: 40, d: 40, h: 90, color: '#7FA37A', ignoreLane: true, status: 'live' },
  { id: 'plant-s', name: 'Chậu cây nhỏ', short: 'Cây nhỏ', cat: 'balcony', place: 'floor', w: 25, d: 25, h: 35, color: '#98B58F', ignoreLane: true, status: 'live' },
  { id: 'bal-set', name: 'Bàn ghế ban công', short: 'Bàn ghế', cat: 'balcony', place: 'floor', w: 90, d: 60, h: 75, color: '#B89B7A', shape: 'table', note: 'Chừa ~60 cm phía ghế để ngồi', status: 'live' },
  { id: 'bal-chair', name: 'Ghế thư giãn', short: 'Ghế', cat: 'balcony', place: 'floor', w: 60, d: 70, h: 85, color: '#D4B483', shape: 'chair', status: 'live' },
  { id: 'rack', name: 'Giá phơi đồ', short: 'Phơi đồ', cat: 'balcony', place: 'floor', w: 120, d: 50, h: 150, color: '#B8BEC4', note: 'Chừa lối đi ≥ 60 cm phía trước', status: 'live' },
];
