import { afterEach, describe, expect, it } from 'vitest';
import { doorGeom } from '../src/core/geometry';
import { designHealth, healthLevel } from '../src/core/health';
import { freshLayout } from '../src/core/layout';
import { TEMPLATES, totalRooms } from '../src/core/project';
import { registry } from '../src/core/registry';
import { roomGeo } from '../src/core/room';
import { LIMITS } from '../src/core/limits';
import { ROOMS } from '../src/data/rooms';
import { setLang } from '../src/i18n';
import { apartmentHealthHtml, healthHtml } from '../src/ui/health';

afterEach(() => setLang('vi'));

function room() {
  let uid = 1;
  const layout = freshLayout(ROOMS.ngu, registry, () => uid++);
  return { layout, R: roomGeo(ROOMS.ngu, layout) };
}
const byId = (cs: ReturnType<typeof designHealth>) => Object.fromEntries(cs.map((c) => [c.id, c]));

describe('kiểm tra thiết kế (designHealth)', () => {
  it('phòng không có món nào: ba mục đều đạt', () => {
    const { layout, R } = room();
    layout.items = [];
    const cs = designHealth(layout, R, registry);
    expect(cs.map((c) => c.id)).toEqual(['overlap', 'doors', 'lane']);
    expect(cs.every((c) => c.level === 'ok')).toBe(true);
    expect(healthLevel(cs)).toBe('ok');
  });

  it('món chồng lấn hoặc ra ngoài phòng là lỗi, đếm đúng số món', () => {
    const { layout, R } = room();
    layout.items = layout.items.slice(0, 2);
    layout.items[0]!.x = 0;
    layout.items[0]!.y = 0;
    const c = byId(designHealth(layout, R, registry));
    expect(c.overlap!.level).toBe('bad');
    expect(c.overlap!.text).toMatch(/^\d+ món chồng lấn hoặc nằm ngoài phòng$/);
    expect(healthLevel(Object.values(c))).toBe('bad');
  });

  it('món chắn vùng mở cửa là lỗi riêng ở mục cửa, không tính vào mục chồng lấn', () => {
    const { layout, R } = room();
    const z = doorGeom(R, R.doors[0]!).zone;
    const it = layout.items.find((i) => i.id === 'night')!;
    layout.items = [it];
    it.x = (z.x0 + z.x1) / 2;
    it.y = (z.y0 + z.y1) / 2;
    const c = byId(designHealth(layout, R, registry));
    expect(c.doors!.level).toBe('bad');
    expect(c.doors!.text).toBe('1 món đang chắn vùng mở cửa');
    expect(c.overlap!.level).toBe('ok');
  });

  it('lối đi dưới 60 cm chỉ là cảnh báo (vàng), từ 60 cm là đạt', () => {
    const { layout, R } = room();
    const bed = layout.items.find((i) => i.id === 'bed2')!;
    const dress = layout.items.find((i) => i.id === 'dress')!;
    layout.items = [bed, dress];
    bed.x = 100;
    bed.y = 115;
    dress.x = 275;
    dress.y = 100;
    dress.rot = 0;
    const warn = byId(designHealth(layout, R, registry));
    expect(warn.lane!.level).toBe('warn');
    expect(warn.lane!.text).toBe('Lối đi giữa Giường đôi và Bàn trang điểm chỉ rộng 40 cm (nên từ 60 cm)');
    expect(healthLevel(Object.values(warn))).toBe('warn');
    dress.x = 295; // cách giường 60 cm
    expect(byId(designHealth(layout, R, registry)).lane!.level).toBe('ok');
  });

  it('câu theo ngôn ngữ', () => {
    const { layout, R } = room();
    layout.items = [];
    setLang('en');
    expect(designHealth(layout, R, registry).map((c) => c.text)).toEqual(['No items overlap or stick out of the room', 'Doors and windows are clear', 'Passages are clear']);
  });
});

describe('khung Kiểm tra thiết kế', () => {
  it('một phòng: huy hiệu mức chung và mỗi mục một dòng có biểu tượng', () => {
    const { layout, R } = room();
    layout.items = [];
    const html = healthHtml(designHealth(layout, R, registry));
    expect(html).toContain('<span>Kiểm tra thiết kế</span><span class="hbadge ok"><i aria-hidden="true">✓</i>Ổn</span>');
    expect((html.match(/class="hl ok"/g) ?? []).length).toBe(3);
    layout.items = [...room().layout.items];
    layout.items[0]!.x = 0;
    layout.items[0]!.y = 0;
    expect(healthHtml(designHealth(layout, R, registry))).toContain('class="hbadge bad"');
  });

  it('cả căn hộ: mỗi phòng một dòng, nêu vấn đề hoặc "Không có vấn đề"', () => {
    const a = room();
    a.layout.items = [];
    const b = room();
    b.layout.items[0]!.x = 0;
    b.layout.items[0]!.y = 0;
    const html = apartmentHealthHtml([
      { name: 'Phòng ngủ', checks: designHealth(a.layout, a.R, registry) },
      { name: 'Phòng ngủ 2', checks: designHealth(b.layout, b.R, registry) },
    ]);
    expect(html).toContain('Phòng ngủ: Không có vấn đề');
    expect(html).toMatch(/Phòng ngủ 2: \d+ món chồng lấn hoặc nằm ngoài phòng/);
    expect(html).toContain('class="hbadge bad"');
  });
});

describe('mẫu căn hộ', () => {
  it('mã khác nhau, số phòng hợp lệ (1 đến giới hạn), có tên', () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    for (const t of TEMPLATES) {
      expect(t.name).not.toBe('');
      expect(totalRooms(t.counts)).toBeGreaterThanOrEqual(1);
      expect(totalRooms(t.counts)).toBeLessThanOrEqual(LIMITS.maxRooms);
    }
  });
});
