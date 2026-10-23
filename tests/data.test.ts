import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../src/data/categories';
import { ALL_ITEMS } from '../src/data/items';
import { ROOMS, ROOM_TYPE_IDS } from '../src/data/rooms';
import { SHAPE_IDS } from '../src/data/shapes';
import { OPENING_PRESETS } from '../src/data/openings';
import type { ItemDef, OpeningPreset } from '../src/data/schema';
import { validateData, validateOpeningPresets } from '../src/core/validate';

const rooms = ROOM_TYPE_IDS.map((id) => ROOMS[id]);
const base: ItemDef = { id: 'test1', name: 'Thử', cat: 'sleeping', place: 'floor', w: 100, d: 50, h: 40, color: '#112233', status: 'live' };

function issues(items: ItemDef[]) {
  return validateData(items, CATEGORIES, [], SHAPE_IDS);
}

describe('dữ liệu đồ thật của ứng dụng', () => {
  it('không có lỗi nào', () => {
    const errors = validateData(ALL_ITEMS, CATEGORIES, rooms, SHAPE_IDS).filter((i) => i.level === 'error');
    expect(errors).toEqual([]);
  });
  it('không có cảnh báo nào', () => {
    const warns = validateData(ALL_ITEMS, CATEGORIES, rooms, SHAPE_IDS).filter((i) => i.level === 'warn');
    expect(warns).toEqual([]);
  });
});

describe('validateData bắt lỗi khai báo', () => {
  it('mã trùng', () => {
    expect(issues([base, base]).some((i) => i.message.includes('trùng'))).toBe(true);
  });
  it('mã sai quy tắc', () => {
    expect(issues([{ ...base, id: 'Bad Id' }]).some((i) => i.field === 'id')).toBe(true);
  });
  it('nhóm không tồn tại và nhóm lệch loại đặt', () => {
    expect(issues([{ ...base, cat: 'nope' }]).some((i) => i.field === 'cat')).toBe(true);
    expect(issues([{ ...base, cat: 'wall-hang' }]).some((i) => i.field === 'place')).toBe(true);
  });
  it('kích thước ngoài khoảng', () => {
    expect(issues([{ ...base, w: 5 }]).some((i) => i.field === 'w')).toBe(true);
    expect(issues([{ ...base, d: 700 }]).some((i) => i.field === 'd')).toBe(true);
  });
  it('màu sai', () => {
    expect(issues([{ ...base, color: 'red' }]).some((i) => i.field === 'color')).toBe(true);
    expect(issues([{ ...base, color: '#abc' }]).some((i) => i.field === 'color')).toBe(true);
  });
  it('tên ngắn quá dài', () => {
    expect(issues([{ ...base, short: 'rất rất dài luôn' }]).some((i) => i.field === 'short')).toBe(true);
  });
  it('kiểu vẽ chưa có', () => {
    const it = { ...base, shape: 'cube' } as unknown as ItemDef;
    expect(issues([it]).some((i) => i.field === 'shape')).toBe(true);
  });
  it('đồ tường thiếu y', () => {
    const wall: ItemDef = { ...base, id: 'w1', cat: 'wall-hang', place: 'wall', w: 60, d: 3, h: 80 };
    expect(issues([wall]).some((i) => i.field === 'y')).toBe(true);
    expect(issues([{ ...wall, y: 120 }]).filter((i) => i.level === 'error')).toEqual([]);
  });
  it('món retired phải có replacedBy trỏ tới món còn dùng', () => {
    const old: ItemDef = { ...base, id: 'old1', status: 'retired' };
    expect(issues([old]).some((i) => i.field === 'replacedBy')).toBe(true);
    expect(issues([{ ...old, replacedBy: 'missing' }]).some((i) => i.field === 'replacedBy')).toBe(true);
    expect(issues([{ ...old, replacedBy: 'test1' }, base]).filter((i) => i.level === 'error')).toEqual([]);
    // vòng lặp
    const a: ItemDef = { ...base, id: 'a1', status: 'retired', replacedBy: 'b1' };
    const b: ItemDef = { ...base, id: 'b1', status: 'retired', replacedBy: 'a1' };
    expect(issues([a, b]).some((i) => i.message.includes('vòng lặp'))).toBe(true);
  });
  it('bố trí mẫu không được dùng món chưa live hoặc không tồn tại', () => {
    const draft: ItemDef = { ...base, id: 'dr1', status: 'draft' };
    const room = { ...ROOMS.ngu, sample: { floor: [['dr1', 100, 100, 0], ['ghost', 50, 50, 0]], walls: {} } } as typeof ROOMS.ngu;
    const out = validateData([draft], CATEGORIES, [room], SHAPE_IDS);
    expect(out.filter((i) => i.field === 'sample').length).toBe(2);
  });
});

describe('các loại cửa đi, cửa sổ trong thư viện', () => {
  const itemIds = ALL_ITEMS.map((i) => i.id);
  const door: OpeningPreset = { id: 'doorX', kind: 'door', name: 'Cửa thử', w: 80, color: '#C9A27E' };
  const win: OpeningPreset = { id: 'winX', kind: 'win', name: 'Cửa sổ thử', w: 100, sill: 90, h: 120, color: '#BFD7E3' };
  const check = (list: OpeningPreset[]) => validateOpeningPresets(list, itemIds);
  const errorsOf = (list: OpeningPreset[]) => check(list).map((i) => `${i.where}:${i.field}`);

  it('dữ liệu thật không có lỗi, có cả cửa đi và cửa sổ', () => {
    expect(validateOpeningPresets(OPENING_PRESETS, itemIds)).toEqual([]);
    expect(OPENING_PRESETS.some((p) => p.kind === 'door')).toBe(true);
    expect(OPENING_PRESETS.some((p) => p.kind === 'win')).toBe(true);
  });

  it('mã cửa không trùng mã món nào (cả hai đi chung đường kéo thả)', () => {
    const ids = new Set(itemIds);
    for (const p of OPENING_PRESETS) expect(ids.has(p.id)).toBe(false);
  });

  it('bắt lỗi: trùng mã giữa các cửa, trùng mã món, mã sai kiểu', () => {
    expect(errorsOf([door, door])).toEqual(['doorX:id']);
    expect(errorsOf([{ ...door, id: 'bed2' }])).toEqual(['bed2:id']);
    expect(errorsOf([{ ...door, id: 'Cửa 1' }])).toEqual(['Cửa 1:id']);
  });

  it('bắt lỗi: thiếu tên, màu sai, loại sai', () => {
    expect(errorsOf([{ ...door, name: ' ' }])).toEqual(['doorX:name']);
    expect(errorsOf([{ ...door, color: 'red' }])).toEqual(['doorX:color']);
    expect(errorsOf([{ ...door, kind: 'gate' as never }])).toEqual(['doorX:kind']);
  });

  it('bắt lỗi chiều rộng: dưới 30 cm hoặc quá lớn so với phòng rộng nhất', () => {
    expect(errorsOf([{ ...door, w: 20 }])).toEqual(['doorX:w']);
    expect(errorsOf([{ ...door, w: 1600 }])).toEqual(['doorX:w']);
    expect(errorsOf([{ ...door, w: Number.NaN }])).toEqual(['doorX:w']);
    expect(check([door, win])).toEqual([]);
  });

  it('cửa đi không được có bậu, chiều cao riêng; cửa sổ phải vừa trần thấp nhất (220 cm)', () => {
    expect(errorsOf([{ ...door, sill: 10 }])).toEqual(['doorX:sill']);
    expect(errorsOf([{ ...win, sill: 150, h: 100 }])).toEqual(['winX:h']);
    expect(errorsOf([{ ...win, sill: -5 }])).toEqual(['winX:sill']);
    expect(errorsOf([{ ...win, h: 5 }])).toEqual(['winX:h']);
    // không ghi bậu, cao thì dùng mặc định 90 + 120 = 210: hợp lệ
    expect(check([{ id: 'winY', kind: 'win', name: 'Mặc định', w: 100, color: '#BFD7E3' }])).toEqual([]);
  });
});
