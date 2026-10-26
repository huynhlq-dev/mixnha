import { describe, expect, it } from 'vitest';
import { CELL, HALL_MAX, interiorSpace, type Box } from '../src/core/interior';

const room = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });
const area = (bands: readonly Box[]) => bands.reduce((s, b) => s + (b.w * b.h) / 10000, 0);
const covers = (bands: readonly Box[], x: number, y: number) => bands.some((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);

describe('diện tích trong nhà (phòng cộng hành lang)', () => {
  it('không có phòng thì bằng 0', () => {
    expect(interiorSpace([])).toEqual({ rooms: 0, gaps: 0, total: 0, bands: [] });
  });

  it('một phòng: chỉ có diện tích phòng, không có hành lang', () => {
    const r = interiorSpace([room(0, 0, 400, 300)]);
    expect(r.rooms).toBeCloseTo(12, 6);
    expect(r.gaps).toBe(0);
    expect(r.total).toBeCloseTo(12, 6);
    expect(r.bands).toEqual([]);
  });

  it('hai phòng cách 90 cm: khe giữa hai lớp tường (70 × 320 cm) được tính, vẽ thành một dải', () => {
    const r = interiorSpace([room(0, 0, 400, 300), room(490, 0, 400, 300)]);
    expect(r.rooms).toBeCloseTo(24, 6);
    expect(r.gaps).toBeCloseTo(2.24, 6);
    expect(r.total).toBeCloseTo(26.24, 6);
    expect(r.bands).toEqual([{ x: 410, y: -10, w: 70, h: 320 }]);
    expect(area(r.bands)).toBeCloseTo(r.gaps, 6);
  });

  it('hai phòng áp sát (hai lớp tường chạm nhau) thì không có hành lang', () => {
    const r = interiorSpace([room(0, 0, 300, 300), room(320, 0, 300, 300)]);
    expect(r.gaps).toBe(0);
  });

  it('khe hẹp hơn HALL_MAX thì tính, từ HALL_MAX trở lên thì không', () => {
    expect(HALL_MAX).toBe(150);
    // khe giữa hai mặt tường = khoảng cách giữa hai phòng trừ 20 cm
    const a = (gap: number) => interiorSpace([room(0, 0, 300, 300), room(300 + gap + 20, 0, 300, 300)]);
    expect(a(140).gaps).toBeCloseTo(4.48, 6);
    expect(a(150).gaps).toBe(0);
    expect(a(400).gaps).toBe(0);
  });

  it('phòng xa nhau thì không có hành lang', () => {
    expect(interiorSpace([room(0, 0, 300, 300), room(2000, 0, 300, 300)]).gaps).toBe(0);
  });

  it('khe dọc cũng tính: hai phòng chồng theo chiều dọc', () => {
    const r = interiorSpace([room(0, 0, 300, 300), room(0, 380, 300, 300)]);
    expect(r.gaps).toBeCloseTo(0.6 * 3.2, 6);
  });

  it('sân trong 100 × 100 cm bốn phòng bao quanh thì tính; sân 300 × 300 thì không', () => {
    // N, S nằm trên và dưới, W, E ở hai bên; khoảng trống kín giữa chúng là s × s
    const around = (s: number) => [
      room(-200, -100, s + 620, 200),
      room(-200, 110 + s + 10, s + 620, 200),
      room(-200, 120, 300, s - 20),
      room(120 + s, 120, 300, s - 20),
    ];
    const small = interiorSpace(around(100));
    expect(small.gaps).toBeCloseTo(1, 6);
    expect(covers(small.bands, 160, 160)).toBe(true);
    expect(interiorSpace(around(300)).gaps).toBe(0);
  });

  it('chỗ lõm hở ra ngoài không được tính, chỉ tính khe kẹp giữa hai phòng', () => {
    // phòng dài phía trên, phòng nhỏ phía dưới bên trái: bên phải phòng nhỏ để hở
    const r = interiorSpace([room(0, 0, 600, 300), room(0, 380, 200, 200)]);
    expect(r.gaps).toBeGreaterThan(0);
    for (const b of r.bands) expect(b.x + b.w).toBeLessThanOrEqual(210 + CELL);
  });

  it('các hàng liền nhau có cùng đoạn trống thì gộp thành một hình chữ nhật', () => {
    const r = interiorSpace([room(0, 0, 300, 300), room(390, 0, 300, 300)]);
    expect(r.bands).toHaveLength(1);
  });

  it('tọa độ lẻ (không bám lưới) vẫn tính được và gần đúng', () => {
    const r = interiorSpace([room(3, 7, 403, 297), room(497, 5, 391, 301)]);
    expect(r.gaps).toBeGreaterThan(1.5);
    expect(r.gaps).toBeLessThan(3);
  });

  it('cùng một bố cục thì dùng lại kết quả đã tính', () => {
    const rs = [room(0, 0, 300, 300), room(390, 0, 300, 300)];
    expect(interiorSpace(rs)).toBe(interiorSpace(rs.map((r) => ({ ...r }))));
    expect(interiorSpace(rs)).not.toBe(interiorSpace(rs, 100));
  });

  it('căn hộ trải quá rộng thì chỉ tính diện tích các phòng, không dò khoảng trống (tránh tốn bộ nhớ)', () => {
    const r = interiorSpace([room(0, 0, 400, 300), room(30000, 30000, 400, 300)]);
    expect(r.gaps).toBe(0);
    expect(r.bands).toEqual([]);
    expect(r.total).toBeCloseTo(24, 6);
  });
});
