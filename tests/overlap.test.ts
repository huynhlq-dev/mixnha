import { describe, expect, it } from 'vitest';
import { interiorSpace } from '../src/core/interior';
import type { Box } from '../src/core/interior';
import { coversOf, MIN_VISIBLE, overlaps, roomAreas, stackOrder, topmostAt, uncovered, uncoveredArea, visibleAreas, visibleEnough, WALL } from '../src/core/overlap';
import { sanitizeApt } from '../src/storage/sanitize';

const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });
const sum = (bs: readonly Box[]) => bs.reduce((s, b) => s + b.w * b.h, 0);

describe('thứ tự lớp', () => {
  it('z nhỏ ở dưới; cùng z thì phòng đứng sau trong danh sách nằm trên', () => {
    expect(stackOrder(['a', 'b', 'c'], () => 0)).toEqual(['a', 'b', 'c']);
    expect(stackOrder(['a', 'b', 'c'], (id) => (id === 'a' ? 2 : id === 'b' ? 1 : 0))).toEqual(['c', 'b', 'a']);
    expect(stackOrder(['a', 'b', 'c'], (id) => (id === 'b' ? 1 : 0))).toEqual(['a', 'c', 'b']);
  });

  it('không đổi danh sách gốc', () => {
    const ids = ['a', 'b'];
    stackOrder(ids, (id) => (id === 'a' ? 5 : 0));
    expect(ids).toEqual(['a', 'b']);
  });
});

describe('chồng phòng', () => {
  it('overlaps tính cả tường 10 cm: hai lớp tường chỉ chạm nhau thì chưa chồng', () => {
    expect(WALL).toBe(10);
    const a = box(0, 0, 300, 300);
    expect(overlaps(a, box(320, 0, 300, 300))).toBe(false);
    expect(overlaps(a, box(319, 0, 300, 300))).toBe(true);
    expect(overlaps(a, box(100, 100, 50, 50))).toBe(true);
    expect(overlaps(a, box(2000, 2000, 50, 50))).toBe(false);
  });

  it('coversOf: phòng nào bị các phòng nằm trên che, mỗi hộp nới thêm tường; phòng không chạm thì không tính', () => {
    const rects = { a: box(0, 0, 400, 350), b: box(10, 10, 200, 220), c: box(2000, 0, 100, 100) };
    const c = coversOf(rects, ['a', 'b', 'c']);
    expect(c.a).toEqual([box(0, 0, 220, 240)]);
    expect(c.b).toEqual([]);
    expect(c.c).toEqual([]);
    // đổi lớp thì ngược lại: a nằm trên b
    const r = coversOf(rects, ['b', 'a', 'c']);
    expect(r.b).toEqual([box(-10, -10, 420, 370)]);
    expect(r.a).toEqual([]);
  });
});

describe('phần còn thấy của một phòng', () => {
  it('không bị che thì còn nguyên một hình', () => {
    expect(uncovered(box(0, 0, 400, 300), [])).toEqual([box(0, 0, 400, 300)]);
  });

  it('bị che một góc: phần còn lại là hình chữ L, tách thành các hình chữ nhật rời nhau, diện tích đúng', () => {
    const parts = uncovered(box(0, 0, 400, 300), [box(0, 0, 100, 100)]);
    expect(sum(parts)).toBe(400 * 300 - 100 * 100);
    expect(parts.length).toBe(2);
  });

  it('bị che ở giữa cạnh hoặc ở giữa phòng (vòng quanh): diện tích đúng', () => {
    expect(sum(uncovered(box(0, 0, 400, 300), [box(100, 0, 100, 100)]))).toBe(120000 - 10000);
    expect(sum(uncovered(box(0, 0, 400, 300), [box(100, 100, 100, 100)]))).toBe(120000 - 10000);
  });

  it('che quá biên thì chỉ tính phần giao; che kín thì không còn gì', () => {
    expect(uncoveredArea(box(0, 0, 400, 300), [box(300, -50, 300, 500)])).toBe(300 * 300);
    expect(uncovered(box(0, 0, 400, 300), [box(-10, -10, 500, 400)])).toEqual([]);
  });

  it('nhiều hộp che chồng nhau không bị tính hai lần', () => {
    expect(uncoveredArea(box(0, 0, 400, 300), [box(0, 0, 200, 200), box(100, 100, 200, 200)])).toBe(120000 - (40000 + 40000 - 10000));
  });

  it('roomAreas tính theo m² cho từng phòng; visibleAreas cho danh sách hộp từ dưới lên', () => {
    const rects = { a: box(0, 0, 400, 350), b: box(10, 10, 200, 220) };
    const a = roomAreas(rects, ['a', 'b']);
    expect(a.b).toBeCloseTo(4.4, 6);
    expect(a.a).toBeCloseTo((140000 - 220 * 240) / 10000, 6);
    expect(visibleAreas([rects.a, rects.b])[0]).toBeCloseTo(a.a, 6);
    expect(visibleAreas([rects.b, rects.a])[1]).toBeCloseTo(14, 6);
  });
});

describe('giới hạn che phòng', () => {
  it('còn thấy ít nhất MIN_VISIBLE thì được; che gần hết thì không', () => {
    expect(MIN_VISIBLE).toBe(30000);
    const rects = { a: box(0, 0, 400, 350), b: box(10, 10, 200, 220) };
    expect(visibleEnough(rects, ['a', 'b'])).toBe(true);
    const swallow = { a: box(0, 0, 200, 220), b: box(-10, -10, 250, 250) };
    expect(visibleEnough(swallow, ['a', 'b'])).toBe(false);
    // phòng lớn nằm dưới một phòng nhỏ thì vẫn còn thấy nhiều
    expect(visibleEnough({ a: box(0, 0, 200, 220), b: box(-10, -10, 600, 500) }, ['b', 'a'])).toBe(true);
  });

  it('phòng không bị che thì luôn đạt, dù nhỏ', () => {
    expect(visibleEnough({ a: box(0, 0, 100, 100), b: box(500, 500, 100, 100) }, ['a', 'b'])).toBe(true);
  });
});

describe('phòng nằm trên cùng tại một điểm', () => {
  const rects = { a: box(0, 0, 400, 350), b: box(10, 10, 200, 220) };

  it('lấy phòng nằm trên trong thứ tự lớp; ngoài mọi phòng thì null', () => {
    expect(topmostAt(rects, ['a', 'b'], { x: 100, y: 100 })).toBe('b');
    expect(topmostAt(rects, ['b', 'a'], { x: 100, y: 100 })).toBe('a');
    expect(topmostAt(rects, ['a', 'b'], { x: 350, y: 300 })).toBe('a');
    expect(topmostAt(rects, ['a', 'b'], { x: 900, y: 900 })).toBeNull();
  });

  it('pad mở rộng để thả trúng tường', () => {
    expect(topmostAt(rects, ['a', 'b'], { x: 405, y: 100 })).toBeNull();
    expect(topmostAt(rects, ['a', 'b'], { x: 405, y: 100 }, 10)).toBe('a');
  });
});

describe('diện tích trong nhà khi phòng chồng nhau', () => {
  it('phần chồng chỉ tính một lần: phòng dưới trừ phần bị phòng trên che (kể cả tường)', () => {
    const r = interiorSpace([box(0, 0, 400, 350), box(10, 10, 200, 220)]);
    expect(r.rooms).toBeCloseTo((140000 - 220 * 240 + 44000) / 10000, 6);
    expect(r.gaps).toBe(0);
  });

  it('đổi thứ tự lớp thì phòng trên là phòng kia', () => {
    const r = interiorSpace([box(10, 10, 200, 220), box(0, 0, 400, 350)]);
    expect(r.rooms).toBeCloseTo(14, 6);
  });
});

describe('lưu thứ tự lớp', () => {
  it('sanitizeApt giữ z hợp lệ (số nguyên dương), bỏ z lạ hoặc bằng 0', () => {
    const out = sanitizeApt({ a: { x: 1, y: 2, z: 3 }, b: { x: 1, y: 2, z: 0 }, c: { x: 1, y: 2, z: 'x' }, d: { x: 1, y: 2, z: -4 }, e: { x: 1, y: 2, z: 2.6 }, f: { x: 1, y: 2, z: 1e9 }, g: { x: 1, y: 2 } });
    expect(out.a).toEqual({ x: 1, y: 2, z: 3 });
    expect(out.b).toEqual({ x: 1, y: 2 });
    expect(out.c).toEqual({ x: 1, y: 2 });
    expect(out.d).toEqual({ x: 1, y: 2 });
    expect(out.e).toEqual({ x: 1, y: 2, z: 3 });
    expect(out.f).toEqual({ x: 1, y: 2, z: 10000 });
    expect(out.g).toEqual({ x: 1, y: 2 });
  });
});
