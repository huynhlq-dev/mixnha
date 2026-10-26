import { describe, expect, it } from 'vitest';
import { analysePlan } from '../src/core/analyse';
import { cloneLayout, freshLayout } from '../src/core/layout';
import { resetTo, toggleRail } from '../src/core/ops';
import { registry } from '../src/core/registry';
import { roomDef } from '../src/core/rooms';
import { roomGeo } from '../src/core/room';
import { validateData } from '../src/core/validate';
import { CATEGORIES } from '../src/data/categories';
import { ALL_ITEMS } from '../src/data/items';
import { OPENING_PRESETS } from '../src/data/openings';
import { ROOM_TYPE_IDS, ROOMS, type RoomEntry } from '../src/data/rooms';
import { SHAPE_IDS } from '../src/data/shapes';
import { buildFile, parseDesignFile, serializeFile } from '../src/storage/file';
import { sanitizeSaved } from '../src/storage/sanitize';
import { loadState, saveState } from '../src/storage/save';
import { memoryKV } from '../src/storage/kv';
import { renderElevation } from '../src/views/elevation';
import { renderPlan } from '../src/views/plan';

let uid = 1;
const nextUid = () => uid++;
const BAL: RoomEntry = { id: 'banchong', type: 'banchong', name: 'Ban công' };
const def = roomDef(BAL);
const balcony = () => freshLayout(def, registry, nextUid);

describe('loại phòng Ban công', () => {
  it('có trong thư viện loại phòng, cỡ nhỏ, sàn xám, lan can ba cạnh và cửa kính cạnh trên', () => {
    expect(ROOM_TYPE_IDS).toContain('banchong');
    const r = ROOMS.banchong;
    expect(r.name).toBe('Ban công');
    expect(r.W).toBe(300);
    expect(r.H).toBe(150);
    expect(r.rails).toEqual(['R', 'B', 'L']);
    expect(r.doors).toEqual([]);
    expect(r.windows).toHaveLength(1);
    expect(r.windows[0]).toMatchObject({ wall: 'T', sill: 0, h: 210 });
  });

  it('dữ liệu hợp lệ: bố trí mẫu dùng đồ có thật, kiểm tra dữ liệu không báo gì', () => {
    const out = validateData(ALL_ITEMS, CATEGORIES, [ROOMS.banchong], SHAPE_IDS);
    expect(out).toEqual([]);
  });

  it('dựng bản vẽ: lan can theo loại phòng, có đồ mẫu', () => {
    const l = balcony();
    expect(l.rails).toEqual(['R', 'B', 'L']);
    expect(l.items.length).toBeGreaterThan(0);
    expect(l.windows).toHaveLength(1);
  });

  it('bố trí mẫu của ban công không có món chồng lấn hay nằm ngoài phòng', () => {
    const l = balcony();
    expect(analysePlan(l, roomGeo(def, l), registry).bad.size).toBe(0);
  });

  it('phòng thường không có trường lan can', () => {
    const l = freshLayout(ROOMS.ngu, registry, nextUid);
    expect('rails' in l).toBe(false);
    expect(roomGeo(ROOMS.ngu, l).rails).toEqual([]);
  });

  it('roomGeo đọc lan can từ bản vẽ', () => {
    const l = balcony();
    expect(roomGeo(def, l).rails).toEqual(['R', 'B', 'L']);
  });
});

describe('nhóm đồ Ban công & sân và cửa kính ban công', () => {
  it('có nhóm balcony với các món đặt sàn, mã không trùng món khác', () => {
    const cat = CATEGORIES.find((c) => c.id === 'balcony');
    expect(cat).toMatchObject({ name: 'Ban công & sân', place: 'floor' });
    const mine = ALL_ITEMS.filter((i) => i.cat === 'balcony');
    expect(mine.map((i) => i.id)).toEqual(['plant', 'plant-s', 'bal-set', 'bal-chair', 'rack']);
    expect(new Set(ALL_ITEMS.map((i) => i.id)).size).toBe(ALL_ITEMS.length);
    for (const i of mine) expect(registry.get(i.id)?.status).toBe('live');
  });

  it('hai loại cửa kính ban công là cửa sổ sát sàn cao 210 cm', () => {
    for (const id of ['bal180', 'bal240']) {
      const p = OPENING_PRESETS.find((x) => x.id === id)!;
      expect(p).toMatchObject({ kind: 'win', sill: 0, h: 210 });
      expect(registry.opening(id)).toBeDefined();
    }
    expect(OPENING_PRESETS.find((x) => x.id === 'bal240')!.w).toBe(240);
  });
});

describe('bật tắt lan can', () => {
  it('thêm cạnh vào danh sách theo thứ tự trên, phải, dưới, trái; tắt thì bỏ ra', () => {
    const l = freshLayout(ROOMS.ngu, registry, nextUid);
    expect(toggleRail(l, 'L')).toBe(true);
    expect(toggleRail(l, 'T')).toBe(true);
    expect(l.rails).toEqual(['T', 'L']);
    expect(toggleRail(l, 'L')).toBe(false);
    expect(l.rails).toEqual(['T']);
  });

  it('tắt hết lan can của ban công thì còn danh sách rỗng (không quay về mặc định)', () => {
    const l = balcony();
    for (const w of ['R', 'B', 'L'] as const) toggleRail(l, w);
    expect(l.rails).toEqual([]);
  });

  it('Bố trí mẫu đưa lan can về mặc định của loại phòng; phòng không có mặc định thì bỏ lan can', () => {
    const l = balcony();
    toggleRail(l, 'T');
    toggleRail(l, 'R');
    resetTo(l, balcony(), 'plan');
    expect(l.rails).toEqual(['R', 'B', 'L']);
    const n = freshLayout(ROOMS.ngu, registry, nextUid);
    toggleRail(n, 'B');
    resetTo(n, freshLayout(ROOMS.ngu, registry, nextUid), 'all');
    expect('rails' in n).toBe(false);
  });

  it('chỉ phạm vi một tường (mặt đứng) thì không đụng tới lan can', () => {
    const l = balcony();
    toggleRail(l, 'T');
    resetTo(l, balcony(), 'T');
    expect(l.rails).toEqual(['T', 'R', 'B', 'L']);
  });
});

describe('lưu và file', () => {
  const layouts = () => {
    const b = balcony();
    return { banchong: b };
  };
  const rooms = [BAL];

  it('lan can đi vào file xuất và đọc lại đúng, kể cả danh sách rỗng', () => {
    const ls = layouts();
    toggleRail(ls.banchong, 'R');
    const text = serializeFile(buildFile(ls, { scope: 'all', room: 'banchong', now: new Date(2026, 9, 26), rooms }));
    expect(JSON.parse(text).rooms.banchong.rails).toEqual(['B', 'L']);
    const r = parseDesignFile(text, registry);
    expect(r.ok && r.file.rooms[0]!.layout.rails).toEqual(['B', 'L']);

    for (const w of ['B', 'L'] as const) toggleRail(ls.banchong, w);
    const empty = parseDesignFile(serializeFile(buildFile(ls, { scope: 'all', room: 'banchong', now: new Date(2026, 9, 26), rooms })), registry);
    expect(empty.ok && empty.file.rooms[0]!.layout.rails).toEqual([]);
  });

  it('file không ghi lan can thì ban công lấy mặc định của loại phòng; phòng thường thì không có', () => {
    const l = balcony();
    delete l.rails;
    const text = serializeFile(buildFile({ banchong: l }, { scope: 'all', room: 'banchong', now: new Date(2026, 9, 26), rooms }));
    expect(JSON.parse(text).rooms.banchong.rails).toBeUndefined();
    const r = parseDesignFile(text, registry);
    expect(r.ok && r.file.rooms[0]!.layout.rails).toEqual(['R', 'B', 'L']);
  });

  it('làm sạch: bỏ cạnh lạ và trùng, giữ thứ tự trên, phải, dưới, trái; không phải danh sách thì lấy mặc định', () => {
    const base = JSON.parse(JSON.stringify(balcony()));
    const read = (rails: unknown) => sanitizeSaved({ ...base, rails }, def, registry)!.rails;
    expect(read(['L', 'X', 'T', 'L', 5, null])).toEqual(['T', 'L']);
    expect(read([])).toEqual([]);
    expect(read('R')).toEqual(['R', 'B', 'L']);
    expect(read(undefined)).toEqual(['R', 'B', 'L']);
  });

  it('tự lưu rồi đọc lại giữ lan can, kể cả khi người dùng đã bỏ hết', () => {
    const ls = layouts();
    const kv = memoryKV();
    for (const w of ['R', 'B', 'L'] as const) toggleRail(ls.banchong, w);
    saveState(kv, 'banchong', ls, { color: '#e3b7a0', recent: [] }, undefined, undefined, rooms);
    const s = loadState(kv, registry, nextUid)!;
    expect(s.layouts.banchong!.rails).toEqual([]);
    expect(s.rooms).toEqual(rooms);
  });

  it('Hoàn tác dùng bản chụp JSON nên lan can đi theo bản vẽ', () => {
    const l = balcony();
    const copy = cloneLayout(l);
    toggleRail(l, 'T');
    expect(copy.rails).toEqual(['R', 'B', 'L']);
    expect(l.rails).toEqual(['T', 'R', 'B', 'L']);
  });
});

describe('vẽ lan can', () => {
  const planOf = (l = balcony()) => renderPlan({ layout: l, R: roomGeo(def, l), reg: registry, sel: null, dim: false }).svg;

  it('mặt bằng: mỗi cạnh lan can có dải xóa tường, nét lan can và trụ; phòng thường thì không', () => {
    const svg = planOf();
    // ba cạnh lan can: ba nét lan can (stroke-width 1.6)
    expect((svg.match(/stroke-width:1\.6/g) ?? []).length).toBe(3);
    const l = freshLayout(ROOMS.ngu, registry, nextUid);
    expect(planOf(l)).not.toContain('stroke-width:1.6');
  });

  it('mặt bằng: tắt lan can ở một cạnh thì bớt một nét', () => {
    const l = balcony();
    toggleRail(l, 'B');
    expect((planOf(l).match(/stroke-width:1\.6/g) ?? []).length).toBe(2);
  });

  it('mặt bằng gọn (trong mô hình căn hộ) cũng vẽ lan can', () => {
    const l = balcony();
    const svg = renderPlan({ layout: l, R: roomGeo(def, l), reg: registry, sel: null, dim: false, compact: true }).svg;
    expect((svg.match(/stroke-width:1\.6/g) ?? []).length).toBe(3);
  });

  it('mặt đứng: cạnh lan can có tay vịn và trụ, mặt tường mờ; cạnh tường thì như cũ', () => {
    const l = balcony();
    const R = roomGeo(def, l);
    const elev = (wall: 'T' | 'R') => renderElevation({ layout: l, R, reg: registry, wall, sel: null, dim: false }).svg;
    expect(elev('R')).toContain('fill-opacity:.15');
    expect(elev('R')).toContain('stroke-width:3');
    expect(elev('T')).not.toContain('fill-opacity:.15');
  });
});
