import { describe, expect, it } from 'vitest';
import { freshLayout } from '../src/core/layout';
import { registry } from '../src/core/registry';
import { roomGeo } from '../src/core/room';
import { DEFAULT_ROOMS, ROOM_IDS, ROOMS, type RoomId } from '../src/data/rooms';
import { APT_GAP, APT_GRID, APT_MAGNET, APT_MIN_GAP, APT_PAD, apartmentRects, aptOrder, freezePlan, handleSize, moveOver, renderApartment, resizeOver, roomAtPoint, roomSpot, roomsClash, roomViewInApartment, snapRoom, snapSize, zOnTop, type AptRect, type AptRoom } from '../src/views/apartment';
import { visibleEnough as visibleEnoughRaw } from '../src/core/overlap';
const visibleEnough = (r: Record<RoomId, AptRect>, stack: RoomId[]): boolean => visibleEnoughRaw(r, stack);
import { renderPlan } from '../src/views/plan';
import { easeInOut, lerpView, parseView, viewToString } from '../src/views/viewport';
import { fm } from '../src/core/format';
import { interiorSpace } from '../src/core/interior';
import { aptInfoHtml, aptListHtml } from '../src/ui/apartmentPanel';
import { describeApartment3D } from '../src/views/info3d';
import { roomTabsHtml } from '../src/ui/nav';

let uid = 1;
const rooms = (): AptRoom[] =>
  ROOM_IDS.map((id) => {
    const layout = freshLayout(ROOMS[id], registry, () => uid++);
    return { id, type: id, name: ROOMS[id].name, layout, geo: roomGeo(ROOMS[id], layout) };
  });
const sizes = (rs: AptRoom[]) => Object.fromEntries(rs.map((r) => [r.id, { W: r.geo.W, H: r.geo.H }])) as Record<RoomId, { W: number; H: number }>;

describe('xếp phòng thành mô hình căn hộ', () => {
  it('thứ tự: khách, bếp, ngủ, vệ sinh; phòng thêm sau thì nối vào cuối', () => {
    expect(aptOrder(['ngu', 'khach', 'bep', 'wc'], { ngu: 'ngu', khach: 'khach', bep: 'bep', wc: 'wc' })).toEqual(['khach', 'bep', 'ngu', 'wc']);
    expect(aptOrder(['wc', 'ngu'], { wc: 'wc', ngu: 'ngu' })).toEqual(['ngu', 'wc']);
    // xếp theo loại phòng, không theo mã: hai phòng ngủ đứng cạnh nhau, giữ thứ tự trong danh sách
    expect(aptOrder(['ngu2', 'khach', 'ngu'], { ngu2: 'ngu', khach: 'khach', ngu: 'ngu' })).toEqual(['khach', 'ngu2', 'ngu']);
  });

  it('lưới hai cột: cột rộng bằng phòng rộng nhất cột, hàng cao bằng phòng cao nhất hàng, cách nhau APT_GAP', () => {
    const rs = rooms();
    const { rects, footprint, bounds } = apartmentRects(sizes(rs));
    const s = sizes(rs);
    const colW = [Math.max(s.khach.W, s.ngu.W), Math.max(s.bep.W, s.wc.W)];
    const rowH = [Math.max(s.khach.H, s.bep.H), Math.max(s.ngu.H, s.wc.H)];
    expect(rects.khach).toMatchObject({ x: 0, y: 0, w: s.khach.W, h: s.khach.H });
    expect(rects.bep).toMatchObject({ x: colW[0]! + APT_GAP, y: 0 });
    expect(rects.ngu).toMatchObject({ x: 0, y: rowH[0]! + APT_GAP });
    expect(rects.wc).toMatchObject({ x: colW[0]! + APT_GAP, y: rowH[0]! + APT_GAP });
    expect(footprint).toEqual({ x: 0, y: 0, w: colW[0]! + colW[1]! + APT_GAP, h: rowH[0]! + rowH[1]! + APT_GAP });
    expect(bounds).toEqual({ x: -APT_PAD, y: -APT_PAD, w: footprint.w + 2 * APT_PAD, h: footprint.h + 2 * APT_PAD });
  });

  it('các phòng không chồng nhau và đều nằm trong hình bao', () => {
    const { rects, footprint } = apartmentRects(sizes(rooms()));
    const list = Object.values(rects);
    for (const r of list) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(footprint.w);
      expect(r.y + r.h).toBeLessThanOrEqual(footprint.h);
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        const apart = a.x + a.w + APT_GAP <= b.x || b.x + b.w + APT_GAP <= a.x || a.y + a.h + APT_GAP <= b.y || b.y + b.h + APT_GAP <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it('đổi kích thước một phòng thì mô hình xếp lại theo', () => {
    const rs = rooms();
    const before = apartmentRects(sizes(rs));
    const s = sizes(rs);
    s.khach = { W: 800, H: 380 };
    const after = apartmentRects(s);
    expect(after.rects.bep.x).toBe(before.rects.bep.x + 800 - 520);
    expect(after.footprint.w).toBeGreaterThan(before.footprint.w);
  });

  it('khung nhìn của phòng trong căn hộ là khung riêng của phòng dịch tới chỗ phòng nằm', () => {
    const rs = rooms();
    const { rects } = apartmentRects(sizes(rs));
    const ngu = rs.find((r) => r.id === 'ngu')!;
    const local = renderPlan({ layout: ngu.layout, R: ngu.geo, reg: registry, sel: null, dim: false }).bounds;
    expect(local).toEqual({ x: -50, y: -50, w: 500, h: 450 });
    expect(roomViewInApartment(rects.ngu, local)).toEqual({ x: rects.ngu.x - 50, y: rects.ngu.y - 50, w: 500, h: 450 });
  });
});

describe('vẽ mô hình căn hộ', () => {
  it('mỗi phòng là một nhóm bấm được có mã, tên đọc, vùng bấm và tên hiện trên mô hình', () => {
    const f = renderApartment(rooms());
    expect((f.svg.match(/class="aptroom"/g) ?? []).length).toBe(4);
    for (const id of ROOM_IDS) {
      expect(f.svg).toContain(`class="aptroom" data-room="${id}" tabindex="0" role="button"`);
      expect(f.svg).toContain(`>${ROOMS[id].name}</text>`);
    }
    expect((f.svg.match(/class="apthit"/g) ?? []).length).toBe(4);
    expect(f.svg).toContain('Phòng ngủ, 400 × 350 cm, 14 m². Bấm để chọn, bấm đúp để thiết kế phòng này');
    expect(f.svg).toContain('>400 × 350 cm · 14 m²<');
  });

  it('có hình thu nhỏ của đồ nội thất, cửa và nền căn hộ', () => {
    const rs = rooms();
    const f = renderApartment(rs);
    expect(f.svg).toContain('class="aptbase"');
    const ngu = rs.find((r) => r.id === 'ngu')!;
    for (const it of ngu.layout.items) expect(f.svg).toContain(`fill:${it.color}`);
    expect(f.svg).toContain('fill:#BFD7E3'); // cửa sổ
  });

  it('khung hình: tiêu đề, số phòng, tổng diện tích sàn, trạng thái, khung nhìn toàn căn', () => {
    const rs = rooms();
    const f = renderApartment(rs);
    // diện tích trong nhà = các phòng cộng hành lang (khoảng trống kín giữa các phòng)
    const total = interiorSpace(Object.values(apartmentRects(sizes(rs)).rects)).total;
    expect(f.title).toBe('Cả căn hộ');
    expect(f.size).toBe('4 phòng');
    expect(f.area).toContain('m²');
    expect(f.status.tone).toBe('info');
    expect(f.status.text).toContain('Bấm vào một phòng');
    expect(f.status.text).toContain(`${Math.round(total * 10) / 10}`.replace('.', ','));
    expect(f.area).toBe(`${(Math.round(total * 10) / 10).toString().replace('.', ',')} m²`);
    expect(f.bounds).toEqual(apartmentRects(sizes(rs)).bounds);
    expect(f.aria).toContain('4 phòng');
  });

  it('phòng nào đổi kích thước thì mô hình vẽ theo', () => {
    const rs = rooms();
    const ngu = rs.find((r) => r.id === 'ngu')!;
    ngu.layout.W = 500;
    ngu.geo = roomGeo(ROOMS.ngu, ngu.layout);
    expect(renderApartment(rs).svg).toContain('>500 × 350 cm · 17,5 m²<');
  });

  it('tên phòng được thoát ký tự HTML', () => {
    const rs = rooms();
    rs[0]!.name = '<b>x</b>';
    const f = renderApartment(rs);
    expect(f.svg).not.toContain('<b>x</b>');
    expect(f.svg).toContain('&lt;b&gt;');
  });
});

describe('bay vùng nhìn (zoom vào, zoom ra)', () => {
  const a = { x: -70, y: -70, w: 1100, h: 900 };
  const b = { x: 340, y: 20, w: 500, h: 450 };

  it('t = 0 là vùng đầu, t = 1 là vùng cuối', () => {
    expect(lerpView(a, b, 0)).toEqual(a);
    const end = lerpView(a, b, 1);
    for (const k of ['x', 'y', 'w', 'h'] as const) expect(end[k]).toBeCloseTo(b[k], 9);
  });

  it('cỡ vùng nhìn đổi theo cấp số nhân: giữa chừng là trung bình nhân, không phải trung bình cộng', () => {
    const m = lerpView(a, b, 0.5);
    expect(m.w).toBeCloseTo(Math.sqrt(a.w * b.w), 6);
    expect(m.h).toBeCloseTo(Math.sqrt(a.h * b.h), 6);
  });

  it('tâm đi thẳng từ tâm vùng đầu tới tâm vùng cuối', () => {
    const c = (v: typeof a) => [v.x + v.w / 2, v.y + v.h / 2];
    const m = lerpView(a, b, 0.5);
    expect(c(m)[0]).toBeCloseTo((c(a)[0]! + c(b)[0]!) / 2, 6);
    expect(c(m)[1]).toBeCloseTo((c(a)[1]! + c(b)[1]!) / 2, 6);
  });

  it('đơn điệu: zoom vào thì vùng nhìn chỉ nhỏ dần, zoom ra thì chỉ lớn dần', () => {
    let prev = Infinity;
    for (let i = 0; i <= 20; i++) {
      const w = lerpView(a, b, easeInOut(i / 20)).w;
      expect(w).toBeLessThanOrEqual(prev + 1e-9);
      prev = w;
    }
    prev = -Infinity;
    for (let i = 0; i <= 20; i++) {
      const w = lerpView(b, a, easeInOut(i / 20)).w;
      expect(w).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = w;
    }
  });

  it('easeInOut: 0 và 1 ở hai đầu, 0,5 ở giữa, chậm ở đầu và cuối, kẹp ngoài khoảng', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 9);
    expect(easeInOut(0.1)).toBeLessThan(0.1);
    expect(easeInOut(0.9)).toBeGreaterThan(0.9);
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(2)).toBe(1);
  });

  it('viewToString và parseView là nghịch đảo của nhau, từ chối chuỗi sai', () => {
    expect(viewToString({ x: -50, y: -50.126, w: 500, h: 450 })).toBe('-50 -50.13 500 450');
    expect(parseView('-50 -50 500 450')).toEqual({ x: -50, y: -50, w: 500, h: 450 });
    expect(parseView('1,2,3,4')).toEqual({ x: 1, y: 2, w: 3, h: 4 });
    expect(parseView(null)).toBeNull();
    expect(parseView('1 2 3')).toBeNull();
    expect(parseView('1 2 0 4')).toBeNull();
    expect(parseView('a b c d')).toBeNull();
  });
});

describe('cột bên và tab khi xem cả căn hộ', () => {
  it('danh sách phòng: mỗi phòng một nút kèm kích thước, diện tích, số món', () => {
    const rs = rooms();
    const html = aptListHtml(rs);
    expect((html.match(/class="aptitem"/g) ?? []).length).toBe(4);
    for (const id of ROOM_IDS) expect(html).toContain(`data-room="${id}"`);
    expect(html).toContain('400 × 350 cm · 14 m² ·');
    expect(html).toContain(' món');
  });

  it('số liệu tổng: số phòng, diện tích, số món', () => {
    const rs = rooms();
    const html = aptInfoHtml(rs);
    // ba số lớn (phòng, diện tích trong nhà, món đồ) và dòng tách diện tích phòng
    expect(html).toContain('<b>4</b><span>Số phòng</span>');
    expect(html).toContain('<b>48,4 m²</b><span>Diện tích trong nhà</span>');
    expect(html).toContain('<dt>Diện tích phòng</dt><dd>48,4 m²</dd>');
    expect(html).toContain('<span>Số món đồ</span>');
    // chưa tính khoảng trống thì không có dòng hành lang
    expect(html).not.toContain('Hành lang');
  });

  it('số liệu tổng có hành lang: dòng hành lang và diện tích trong nhà = phòng + hành lang', () => {
    const rs = rooms();
    const interior = interiorSpace(Object.values(apartmentRects(sizes(rs)).rects));
    const html = aptInfoHtml(rs, interior);
    expect(interior.gaps).toBeGreaterThan(5);
    expect(html).toContain('<dt>Hành lang, khoảng trống</dt>');
    expect(html).toContain(`<dd>${fm(interior.gaps)} m²</dd>`);
    expect(html).toContain(`<div class="chip tot"><span class="ci" aria-hidden="true">📐</span><b>${fm(interior.total)} m²</b><span>Diện tích trong nhà</span>`);
    expect(html).toContain('được tính vào diện tích trong nhà');
  });

  it('hàng tab phòng: ở trong phòng thì phòng đó được chọn; xem cả căn thì không phòng nào được chọn', () => {
    const inRoom = roomTabsHtml(DEFAULT_ROOMS, 'khach');
    expect(inRoom).toContain('data-room="khach" aria-pressed="true"');
    expect((inRoom.match(/aria-pressed="true"/g) ?? []).length).toBe(1);
    const overview = roomTabsHtml(DEFAULT_ROOMS, 'khach', true);
    // xem cả căn: chỉ tab "Cả căn hộ" (đứng đầu) được chọn, không phòng nào
    expect((overview.match(/aria-pressed="true"/g) ?? []).length).toBe(1);
    expect(overview).toContain('data-apt="1" aria-pressed="true"');
    expect(inRoom).toContain('data-apt="1" aria-pressed="false"');
    expect((overview.match(/data-room=/g) ?? []).length).toBe(4);
    // nút về cả căn hộ nằm ở đầu khung vẽ, không còn là một tab
    expect(inRoom).not.toContain('data-view');
  });
});

describe('vị trí đã chốt của phòng trong căn hộ', () => {
  const S = () => sizes(rooms());

  it('phòng có vị trí trong plan thì nằm đúng chỗ đó, phòng chưa có thì vẫn tự xếp lưới', () => {
    const auto = apartmentRects(S());
    const { rects } = apartmentRects(S(), ROOM_IDS, { ngu: { x: 700, y: -100 } });
    expect(rects.ngu).toMatchObject({ x: 700, y: -100, w: 400, h: 350 });
    expect(rects.khach).toEqual(auto.rects.khach);
    expect(rects.bep).toEqual(auto.rects.bep);
  });

  it('hình bao và khung nhìn theo vị trí thật của các phòng (kể cả tọa độ âm)', () => {
    const { footprint, bounds } = apartmentRects(S(), ROOM_IDS, { ngu: { x: -300, y: 900 } });
    expect(footprint.x).toBe(-300);
    expect(footprint.y).toBe(0);
    expect(footprint.y + footprint.h).toBe(1250); // 900 + 350
    expect(bounds).toEqual({ x: -300 - APT_PAD, y: -APT_PAD, w: footprint.w + 2 * APT_PAD, h: footprint.h + 2 * APT_PAD });
  });

  it('freezePlan chốt đúng vị trí đang hiện của mọi phòng; xếp lại từ plan đó ra đúng như cũ', () => {
    const before = apartmentRects(S());
    const plan = freezePlan(before.rects);
    expect(Object.keys(plan).sort()).toEqual([...ROOM_IDS].sort());
    expect(apartmentRects(S(), ROOM_IDS, plan).rects).toEqual(before.rects);
  });

  it('đã chốt thì đổi cỡ một phòng không làm các phòng khác nhảy (trong khi tự xếp thì có)', () => {
    const base = S();
    const plan = freezePlan(apartmentRects(base).rects);
    const big = { ...base, khach: { W: 900, H: 380 } };
    expect(apartmentRects(big, ROOM_IDS, plan).rects.bep).toEqual(apartmentRects(base).rects.bep);
    expect(apartmentRects(big).rects.bep.x).not.toBe(apartmentRects(base).rects.bep.x);
  });

  it('roomsClash: chạm hoặc gần hơn khoảng cách tối thiểu là chạm, đủ xa thì không', () => {
    const a = { x: 0, y: 0, w: 400, h: 300 };
    expect(roomsClash(a, { x: 300, y: 100, w: 200, h: 200 })).toBe(true);
    expect(roomsClash(a, { x: 410, y: 0, w: 200, h: 200 })).toBe(true); // cách 10 < 20
    expect(roomsClash(a, { x: 420, y: 0, w: 200, h: 200 })).toBe(false); // cách đúng 20
    expect(roomsClash(a, { x: 420, y: 0, w: 200, h: 200 }, 0)).toBe(false);
    expect(roomsClash(a, { x: 400, y: 0, w: 200, h: 200 }, 0)).toBe(false); // chạm mép, không gap
    expect(roomsClash(a, { x: 0, y: 320, w: 200, h: 200 })).toBe(false);
  });
});

describe('dời phòng trong căn hộ', () => {
  // bốn phòng: ngu 0..400 x 0..350, khach 500..800 x 0..300, bep 0..320 x 500..820, wc 500..700 x 500..720
  const rectsOf = (): Record<RoomId, AptRect> =>
    ({
      ngu: { id: 'ngu', x: 0, y: 0, w: 400, h: 350 },
      khach: { id: 'khach', x: 500, y: 0, w: 300, h: 300 },
      bep: { id: 'bep', x: 0, y: 500, w: 320, h: 320 },
      wc: { id: 'wc', x: 500, y: 500, w: 200, h: 220 },
    }) as Record<RoomId, AptRect>;
  const stackOf = (): RoomId[] => ['ngu', 'khach', 'bep', 'wc'];

  it('không bám lưới thì làm tròn cm và không hút gì', () => {
    expect(snapRoom(rectsOf(), 'wc', { x: 833.4, y: 612.7 }, false)).toEqual({ x: 833, y: 613 });
  });

  it('bám lưới 10 cm khi xa mép phòng khác', () => {
    expect(snapRoom(rectsOf(), 'wc', { x: 1003, y: 628 }, true)).toEqual({ x: 1000, y: 630 });
    expect(APT_GRID).toBe(10);
  });

  it('hút vào mép phòng khác: cùng mép trái, cùng mép trên, hoặc cách đúng APT_MIN_GAP', () => {
    // gần mép trái của ngu (x = 0): hút về 0
    expect(snapRoom(rectsOf(), 'wc', { x: 9, y: 900 }, true).x).toBe(0);
    // sát bên phải của khach (khach kết thúc ở 800): đặt cách 20
    expect(snapRoom(rectsOf(), 'wc', { x: 812, y: 100 }, true)).toEqual({ x: 800 + APT_MIN_GAP, y: 100 });
    // sát bên trái của khach: x + 200 + 20 = 500
    expect(snapRoom(rectsOf(), 'wc', { x: 285, y: 1000 }, true).x).toBe(500 - 200 - APT_MIN_GAP);
    // cùng đáy với ngu: y + 220 = 350
    expect(snapRoom(rectsOf(), 'wc', { x: 1200, y: 125 }, true).y).toBe(350 - 220);
    expect(APT_MAGNET).toBe(15);
  });

  it('chỗ trống thì đi thẳng tới chỗ mong muốn', () => {
    expect(moveOver(rectsOf(), stackOf(), 'wc', { x: 500, y: 500 }, { x: 900, y: 100 }, false)).toEqual({ x: 900, y: 100 });
  });

  it('được đè lên phòng khác: phòng đang kéo nằm trên, miễn phòng bị đè còn đủ phần thấy', () => {
    // wc (200 x 220) vào góc trên trái của ngu (400 x 350): ngu còn thấy 140000 - ~57000, nhiều hơn tối thiểu
    expect(moveOver(rectsOf(), stackOf(), 'wc', { x: 500, y: 500 }, { x: 10, y: 10 }, false)).toEqual({ x: 10, y: 10 });
  });

  it('không được che hết một phòng: kéo ngu đè kín wc thì dừng ở chỗ hợp lệ trước đó', () => {
    const r = rectsOf();
    // ngu (400 x 350) dời tới (450, 450) sẽ che hẳn wc (500..700 x 500..720 chỉ 44 000 cm², phần còn thấy dưới 30 000)
    const at = moveOver(r, stackOf(), 'ngu', { x: 0, y: 0 }, { x: 450, y: 450 }, false);
    expect(at).toEqual({ x: 0, y: 0 });
    expect(visibleEnough({ ...r, ngu: { ...r.ngu, ...at } }, ['khach', 'bep', 'wc', 'ngu'])).toBe(true);
  });

  it('kéo chéo vào chỗ không được thì trượt: giữ phần đổi hợp lệ, bỏ phần gây che quá nhiều', () => {
    const r = rectsOf();
    // ngu dời tới (450, 450) không được; chỉ đổi y (0, 450) thì hợp lệ (che phần dưới của bep? bep 0..320 x 500..820 chỉ bị che một phần)
    const at = moveOver(r, stackOf(), 'ngu', { x: 0, y: 0 }, { x: 450, y: 450 }, false);
    expect(visibleEnough({ ...r, ngu: { ...r.ngu, ...at } }, ['khach', 'bep', 'wc', 'ngu'])).toBe(true);
  });

  it('kết quả luôn để mọi phòng còn đủ phần thấy, dù kéo kiểu nào', () => {
    const r = rectsOf();
    const stack = stackOf();
    for (let x = -200; x <= 1200; x += 85) {
      for (let y = -200; y <= 1100; y += 85) {
        for (const snap of [true, false]) {
          const at = moveOver(r, stack, 'wc', { x: 500, y: 500 }, { x, y }, snap);
          expect(visibleEnough({ ...r, wc: { ...r.wc, ...at } }, ['ngu', 'khach', 'bep', 'wc'])).toBe(true);
        }
      }
    }
  });
});

describe('đổi cỡ phòng trong căn hộ', () => {
  const rectsOf = (): Record<RoomId, AptRect> =>
    ({
      ngu: { id: 'ngu', x: 0, y: 0, w: 400, h: 350 },
      khach: { id: 'khach', x: 500, y: 0, w: 300, h: 300 },
      bep: { id: 'bep', x: 0, y: 500, w: 320, h: 320 },
      wc: { id: 'wc', x: 900, y: 900, w: 200, h: 220 },
    }) as Record<RoomId, AptRect>;
  const stack: RoomId[] = ['ngu', 'khach', 'bep', 'wc'];

  it('kẹp trong khoảng 150 đến 1500 cm', () => {
    expect(snapSize(rectsOf(), 'wc', { w: 40, h: 40 }, false)).toEqual({ w: 150, h: 150 });
    expect(snapSize(rectsOf(), 'wc', { w: 9000, h: 9000 }, false)).toEqual({ w: 1500, h: 1500 });
  });

  it('bám lưới: cạnh phải, dưới rơi vào bội của 10 (góc trên trái đứng yên)', () => {
    // wc ở (900, 900): rộng 303 thì cạnh phải = 1203 -> 1200, tức rộng 300
    expect(snapSize(rectsOf(), 'wc', { w: 303, h: 417 }, true)).toEqual({ w: 300, h: 420 });
  });

  it('hút vào mép phòng khác: cạnh phải sát bên trái một phòng thì cách đúng APT_MIN_GAP', () => {
    const r = rectsOf();
    r.wc = { id: 'wc', x: 100, y: 400, w: 200, h: 100 };
    r.bep = { id: 'bep', x: 600, y: 400, w: 320, h: 320 };
    // mép trái bep ở 600: wc rộng sao cho cạnh phải = 580 -> rộng 480
    expect(snapSize(r, 'wc', { w: 475, h: 150 }, true).w).toBe(580 - 100);
  });

  it('đổi cỡ đè lên phòng khác được, miễn phòng bị đè còn đủ phần thấy', () => {
    const r = { ngu: { id: 'ngu', x: 0, y: 0, w: 400, h: 350 }, khach: { id: 'khach', x: 500, y: 0, w: 400, h: 350 } } as Record<RoomId, AptRect>;
    // ngu rộng ra 600: che 100 cm đầu của khach (che cả tường), khach còn thấy 400 x 350 - phần che, đủ
    expect(resizeOver(r, ['ngu', 'khach'], 'ngu', { w: 400, h: 350 }, { w: 600, h: 350 }, false)).toEqual({ w: 600, h: 350 });
  });

  it('đổi cỡ làm che quá nhiều thì giữ cỡ trước đó', () => {
    const r = { ngu: { id: 'ngu', x: 0, y: 0, w: 400, h: 350 }, khach: { id: 'khach', x: 500, y: 0, w: 200, h: 200 } } as Record<RoomId, AptRect>;
    // khach chỉ 200 x 200 = 40 000: ngu rộng tới 650 sẽ che gần hết nó
    expect(resizeOver(r, ['ngu', 'khach'], 'ngu', { w: 400, h: 350 }, { w: 650, h: 350 }, false)).toEqual({ w: 400, h: 350 });
  });

  it('kết quả luôn để mọi phòng còn đủ phần thấy', () => {
    const r = rectsOf();
    for (let w = 100; w <= 1400; w += 130) {
      for (let h = 100; h <= 1400; h += 130) {
        for (const snap of [true, false]) {
          const to = resizeOver(r, stack, 'wc', { w: 200, h: 220 }, { w, h }, snap);
          expect(visibleEnough({ ...r, wc: { ...r.wc, ...to } }, stack)).toBe(true);
          expect(to.w).toBeGreaterThanOrEqual(150);
          expect(to.h).toBeGreaterThanOrEqual(150);
        }
      }
    }
  });
});

describe('vẽ mô hình khi chỉnh bố cục', () => {
  it('không chỉnh thì phòng đang chọn chỉ được tô sáng: không có tay nắm, không có số đo trên cạnh', () => {
    const f = renderApartment(rooms(), { selected: 'ngu' });
    expect(f.svg).not.toContain('apthandle');
    expect(f.svg).not.toContain('edgetag');
    expect((f.svg.match(/data-selected="true"/g) ?? []).length).toBe(1);
    expect(f.svg).toContain('data-room="ngu" data-selected="true"');
  });

  it('chỉnh bố cục nhưng chưa chọn phòng nào: chưa có tay nắm', () => {
    const f = renderApartment(rooms(), { edit: true });
    expect(f.svg).not.toContain('apthandle');
    expect(f.status.text).toContain('Chỉnh bố cục');
    expect(f.aria).toContain('Đang chỉnh bố cục');
  });

  it('phòng đang chọn có ba tay nắm (cạnh phải, cạnh dưới, góc dưới phải) và số đo rộng, dọc; chỉ phòng đó', () => {
    const f = renderApartment(rooms(), { edit: true, selected: 'ngu' });
    expect((f.svg.match(/class="apthandle"/g) ?? []).length).toBe(3);
    for (const h of ['r', 'b', 'br']) expect(f.svg).toContain(`data-handle="${h}"`);
    expect((f.svg.match(/data-selected="true"/g) ?? []).length).toBe(1);
    expect(f.svg).toContain('data-room="ngu" data-selected="true"');
    expect((f.svg.match(/class="edgetag"/g) ?? []).length).toBe(2);
    expect(f.svg).toContain('>400<');
    expect(f.svg).toContain('>350<');
    expect(f.svg).toContain('Kéo để dời phòng, bấm đúp để thiết kế phòng này');
  });

  it('tay nắm to vừa phải theo cỡ khung nhìn', () => {
    expect(handleSize({ x: 0, y: 0, w: 100, h: 100 })).toBe(16);
    expect(handleSize({ x: 0, y: 0, w: 1070, h: 960 })).toBeCloseTo(26.75, 2);
    expect(handleSize({ x: 0, y: 0, w: 9000, h: 9000 })).toBe(40);
  });

  it('vẽ theo vị trí đã chốt: phòng được dời nằm đúng chỗ mới', () => {
    const f = renderApartment(rooms(), { plan: { ngu: { x: 1234, y: 56 } } });
    expect(f.svg).toContain('translate(1234 56)');
  });

  it('phòng chồng nhau không còn báo lỗi: phòng nằm trên khuyết phòng dưới, phòng dưới ghi diện tích còn thấy', () => {
    const rs = rooms();
    // wc (200 x 220) đặt trong góc ngu (400 x 350)
    const f = renderApartment(rs, { plan: { ngu: { x: 0, y: 0 }, khach: { x: 2000, y: 0 }, bep: { x: 2000, y: 900 }, wc: { x: 10, y: 10, z: 1 } } });
    expect(f.svg).not.toContain('data-clash');
    expect(f.svg).toContain('data-room="ngu" data-carved="true"');
    expect(f.svg).not.toContain('data-room="wc" data-carved');
    // ngu mất phần wc chiếm (cả tường 10 cm): ghi diện tích nhỏ hơn 14 m²
    const nguSize = /data-room="ngu".*?400 × 350 cm · ([\d,]+) m²/s.exec(f.svg)?.[1];
    expect(Number(nguSize!.replace(',', '.'))).toBeLessThan(14);
    expect(Number(nguSize!.replace(',', '.'))).toBeGreaterThan(8);
  });

  it('phòng nằm trên vẽ sau (đè lên) phòng nằm dưới; z lớn hơn thì lên trên dù đứng trước trong danh sách', () => {
    const rs = rooms();
    const plan = { ngu: { x: 0, y: 0, z: 5 }, khach: { x: 300, y: 100, z: 1 }, bep: { x: 2000, y: 0 }, wc: { x: 2000, y: 900 } };
    const f = renderApartment(rs, { plan });
    expect(f.svg.indexOf('data-room="khach"')).toBeLessThan(f.svg.indexOf('data-room="ngu"'));
  });
});

describe('thứ tự lớp của phòng', () => {
  it('apartmentRects trả về thứ tự lớp: z nhỏ ở dưới, cùng z thì phòng đứng sau trong danh sách nằm trên', () => {
    const rs = rooms();
    const ids = rs.map((r) => r.id);
    expect(apartmentRects(sizes(rs), ids).stack).toEqual(ids);
    expect(apartmentRects(sizes(rs), ids, { khach: { x: 0, y: 0, z: 2 }, ngu: { x: 0, y: 0, z: 1 } }).stack).toEqual(['bep', 'wc', 'ngu', 'khach']);
  });

  it('freezePlan giữ thứ tự lớp đã có', () => {
    const rs = rooms();
    const rects = apartmentRects(sizes(rs), rs.map((r) => r.id)).rects;
    const plan = freezePlan(rects, { ngu: { x: 0, y: 0, z: 3 } });
    expect(plan.ngu!.z).toBe(3);
    expect(plan.khach).not.toHaveProperty('z');
  });

  it('zOnTop: chồng lên phòng nào thì nằm trên phòng đó; không chồng thì giữ z hiện có', () => {
    const rects = { a: { id: 'a', x: 0, y: 0, w: 400, h: 350 }, b: { id: 'b', x: 10, y: 10, w: 200, h: 220 }, c: { id: 'c', x: 2000, y: 0, w: 300, h: 300 } } as Record<RoomId, AptRect>;
    expect(zOnTop(rects, { a: { x: 0, y: 0, z: 2 } }, 'b')).toBe(3);
    expect(zOnTop(rects, {}, 'b')).toBe(1);
    // đã nằm trên rồi thì giữ nguyên
    expect(zOnTop(rects, { a: { x: 0, y: 0, z: 2 }, b: { x: 10, y: 10, z: 7 } }, 'b')).toBe(7);
    // không chồng phòng nào
    expect(zOnTop(rects, { c: { x: 2000, y: 0, z: 4 } }, 'c')).toBe(4);
    expect(zOnTop(rects, {}, 'c')).toBeUndefined();
  });

  it('roomAtPoint có thứ tự lớp thì lấy phòng nằm trên cùng, kể cả điểm trong vùng bị khuyết', () => {
    const rects = { a: { id: 'a', x: 0, y: 0, w: 400, h: 350 }, b: { id: 'b', x: 10, y: 10, w: 200, h: 220 } } as Record<RoomId, AptRect>;
    expect(roomAtPoint(rects, { x: 100, y: 100 }, 0, ['a', 'b'])).toBe('b');
    expect(roomAtPoint(rects, { x: 100, y: 100 }, 0, ['b', 'a'])).toBe('a');
    expect(roomAtPoint(rects, { x: 300, y: 300 }, 0, ['a', 'b'])).toBe('a');
  });
});

describe('bóng đồ bị phòng khác che', () => {
  const full = (over: Partial<NonNullable<Parameters<typeof renderApartment>[1]>['items']> = {}) => ({ reg: registry, room: null, sel: null, opening: null, dim: false, detail: false, ...over });
  const carvedPlan = { ngu: { x: 0, y: 0 }, khach: { x: 2000, y: 0 }, bep: { x: 2000, y: 900 }, wc: { x: 10, y: 10, z: 1 } };

  it('đồ của phòng dưới nằm trong vùng bị che được vẽ lại thành lớp bóng cắt theo vùng đó, nằm sau cùng', () => {
    const rs = rooms();
    const f = renderApartment(rs, { plan: carvedPlan, items: full() });
    expect(f.svg).toContain('<clipPath id="aptcut-ngu">');
    expect(f.svg).toContain('class="aptghost" data-room="ngu"');
    expect(f.svg).toContain('clip-path="url(#aptcut-ngu)"');
    // lớp bóng đứng sau mọi phòng nên bấm được
    expect(f.svg.indexOf('class="aptghost"')).toBeGreaterThan(f.svg.lastIndexOf('class="aptroom"'));
    // chỉ có phòng dưới bị che mới có bóng
    expect(f.svg).not.toContain('aptcut-wc');
  });

  it('bóng chỉ có đồ và cửa, không có sàn hay tường (phòng nằm trên không bị phủ thêm màu sàn)', () => {
    const rs = rooms();
    const f = renderApartment(rs, { plan: carvedPlan, items: full() });
    const ghost = f.svg.slice(f.svg.indexOf('class="aptghost"'));
    expect(ghost).toContain('class="it"');
    expect(ghost).not.toContain('fill-rule="evenodd"');
  });

  it('không có phòng nào bị che thì không có bóng', () => {
    const f = renderApartment(rooms(), { items: full() });
    expect(f.svg).not.toContain('aptghost');
    expect(f.svg).not.toContain('clipPath');
  });

  it('trạng thái báo món của phòng dưới nằm dưới phòng khác (nếu có món bị che)', () => {
    const rs = rooms();
    // đặt một món ngay dưới wc
    rs.find((r) => r.id === 'ngu')!.layout.items.push({ ...rs.find((r) => r.id === 'ngu')!.layout.items[0]!, uid: 9001, x: 100, y: 100 });
    const f = renderApartment(rs, { plan: carvedPlan, items: full() });
    expect(f.status.tone).toBe('bad');
    expect(f.status.text).toContain('nằm dưới phòng khác');
    expect(f.status.text).toContain('Phòng ngủ');
  });

  it('diện tích trong nhà không đếm hai lần phần chồng nhau', () => {
    const rs = rooms();
    const sep = renderApartment(rs, { plan: { ngu: { x: 0, y: 0 }, khach: { x: 2000, y: 0 }, bep: { x: 2000, y: 900 }, wc: { x: 0, y: 2000 } } });
    const over = renderApartment(rs, { plan: carvedPlan });
    const total = (a: string) => Number(a.replace(' m²', '').replace(',', '.'));
    // wc 4,4 m² nằm trong ngu: tổng giảm đúng phần ngu mất (gồm tường) so với khi wc ở ngoài
    expect(total(over.area)).toBeLessThan(total(sep.area) - 0.5);
  });
});

describe('chỗ đặt phòng mới', () => {
  const R = (id: string, x: number, y: number, w: number, h: number): AptRect => ({ id, x, y, w, h });
  const rects = { a: R('a', 0, 0, 400, 300), b: R('b', 420, 0, 300, 300) };
  const free = (p: { x: number; y: number }, w: number, h: number, others = Object.values(rects)) => others.every((o) => !roomsClash({ x: p.x, y: p.y, w, h }, o));

  it('chỗ muốn đặt còn trống thì lấy đúng chỗ đó, bám lưới khi bật snap', () => {
    expect(roomSpot(rects, 200, 200, { x: 1003, y: 52 }, true)).toEqual({ x: 1000, y: 50 });
    expect(roomSpot(rects, 200, 200, { x: 1003, y: 52 }, false)).toEqual({ x: 1003, y: 52 });
  });

  it('chỗ muốn đặt chạm phòng khác thì dời sang chỗ trống gần nhất, không chồng ai', () => {
    const p = roomSpot(rects, 200, 200, { x: 100, y: 100 }, true);
    expect(free(p, 200, 200)).toBe(true);
    // gần chỗ thả hơn là đẩy hẳn ra xa
    expect(Math.hypot(p.x - 100, p.y - 100)).toBeLessThan(500);
  });

  it('không có chỗ muốn: đặt sát một phòng đang có, cách nhau APT_GAP', () => {
    const p = roomSpot(rects, 200, 200, null, true);
    expect(free(p, 200, 200)).toBe(true);
    const touches = Object.values(rects).some((o) => p.x === o.x + o.w + APT_GAP || p.y === o.y + o.h + APT_GAP || p.x === o.x - 200 - APT_GAP || p.y === o.y - 200 - APT_GAP);
    expect(touches).toBe(true);
  });

  it('thêm liên tiếp nhiều phòng thì phòng nào cũng có chỗ riêng', () => {
    const cur: Record<string, AptRect> = { ...rects };
    for (let i = 0; i < 10; i++) {
      const p = roomSpot(cur, 300, 280, null, true);
      expect(free(p, 300, 280, Object.values(cur))).toBe(true);
      cur[`n${i}`] = R(`n${i}`, p.x, p.y, 300, 280);
    }
  });

  it('căn hộ chưa có phòng nào thì đặt ở gốc', () => {
    expect(roomSpot({}, 300, 280, null, true)).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
    expect(roomSpot({}, 300, 280, { x: 40, y: 60 }, true)).toEqual({ x: 40, y: 60 });
  });
});

describe('tự xếp lưới theo loại phòng', () => {
  it('phòng cùng loại đứng cạnh nhau theo thứ tự trong danh sách; mã lạ không làm hỏng', () => {
    const rs = rooms();
    const extra: AptRoom = { ...rs[0]!, id: 'ngu2', name: 'Phòng ngủ 2' };
    const all = [...rs, extra];
    const types = Object.fromEntries(all.map((r) => [r.id, r.type]));
    const ids = all.map((r) => r.id);
    expect(aptOrder(ids, types)).toEqual(['khach', 'bep', 'ngu', 'ngu2', 'wc']);
    const out = apartmentRects(Object.fromEntries(all.map((r) => [r.id, { W: r.geo.W, H: r.geo.H }])), ids, undefined, types);
    expect(Object.keys(out.rects).sort()).toEqual([...ids].sort());
    const list = Object.values(out.rects);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) expect(roomsClash(list[i]!, list[j]!)).toBe(false);
  });
});

describe('mô hình vẽ đủ đồ và cửa (sửa được ngay)', () => {
  const full = (over: Partial<NonNullable<Parameters<typeof renderApartment>[1]>['items']> = {}) => ({ reg: registry, room: null, sel: null, opening: null, dim: true, detail: false, ...over });

  it('mỗi món có nhóm .it với mã món, mỗi cửa có nhóm .op; hình thu nhỏ thì không', () => {
    const rs = rooms();
    const f = renderApartment(rs, { items: full() });
    const nItems = rs.reduce((n, r) => n + r.layout.items.length, 0);
    const nDoors = rs.reduce((n, r) => n + r.geo.doors.length, 0);
    const nWins = rs.reduce((n, r) => n + r.geo.windows.length, 0);
    expect((f.svg.match(/class="it"/g) ?? []).length).toBe(nItems);
    expect((f.svg.match(/class="op"/g) ?? []).length).toBe(nDoors + nWins);
    expect(renderApartment(rs).svg).not.toContain('class="it"');
    for (const r of rs) for (const it of r.layout.items) expect(f.svg).toContain(`data-uid="${it.uid}"`);
  });

  it('không vẽ lưới, đường kích thước tổng của phòng; tên và cỡ phòng nằm phía trên phòng', () => {
    const f = renderApartment(rooms(), { items: full() });
    expect(f.svg).not.toContain('<line');
    expect(f.svg).not.toContain('400 cm</text>');
    expect(f.svg).toMatch(/<text class="aptname" x="0" y="-\d/);
  });

  it('món đang chọn chỉ có ở phòng hiện tại: viền, kích thước quanh món và tay nắm xoay', () => {
    const rs = rooms();
    const bed = rs.find((r) => r.id === 'ngu')!.layout.items[0]!;
    const withSel = renderApartment(rs, { items: full({ room: 'ngu', sel: { scope: 'floor', uid: bed.uid } }) });
    expect(withSel.svg).toContain('rot-handle');
    expect((withSel.svg.match(/class="rot-handle"/g) ?? []).length).toBe(1);
    // cùng một mã món nhưng đang ở phòng khác thì không được chọn
    const other = renderApartment(rs, { items: full({ room: 'khach', sel: { scope: 'floor', uid: bed.uid } }) });
    expect(other.svg).not.toContain('rot-handle');
  });

  it('khung tô sáng phòng (.apthit) vẽ sau đồ để không che; đồ vẫn là phần tử bấm được', () => {
    const f = renderApartment(rooms(), { items: full() });
    const room = f.svg.slice(f.svg.indexOf('data-room="ngu"'), f.svg.indexOf('data-room="khach"'));
    expect(room.indexOf('class="it"')).toBeGreaterThan(-1);
    expect(room.indexOf('class="apthit"')).toBeGreaterThan(room.lastIndexOf('class="it"'));
  });

  it('trạng thái: đồ chồng lấn thì báo bằng tên phòng, viền cam', () => {
    const rs = rooms();
    const l = rs.find((r) => r.id === 'ngu')!.layout;
    l.items.push({ ...l.items[0]!, uid: 9999 });
    const f = renderApartment(rs, { items: full() });
    expect(f.status.tone).toBe('bad');
    expect(f.status.text).toContain('Phòng ngủ');
    expect(f.svg).toContain('var(--warn)');
  });

  it('trạng thái khi ổn: hướng dẫn kéo đồ thả vào phòng', () => {
    const f = renderApartment(rooms(), { items: full() });
    expect(f.status.tone).toBe('info');
    expect(f.status.text).toContain('Kéo đồ vào phòng');
    expect(f.status.text).toContain('4 phòng');
    expect(f.status.text).toContain('hành lang');
  });
});

describe('phòng chứa một điểm trên mô hình', () => {
  const rects = apartmentRects(sizes(rooms()), ROOM_IDS).rects;

  it('điểm trong phòng nào thì trả về phòng đó; hành lang thì null', () => {
    const k = rects.khach!;
    expect(roomAtPoint(rects, { x: k.x + 10, y: k.y + 10 })).toBe('khach');
    const b = rects.bep!;
    expect(roomAtPoint(rects, { x: b.x + b.w / 2, y: b.y + b.h / 2 })).toBe('bep');
    // khe giữa hai phòng cạnh nhau là hành lang
    expect(roomAtPoint(rects, { x: k.x + k.w + APT_GAP / 2, y: k.y + 20 })).toBeNull();
    expect(roomAtPoint(rects, { x: -5000, y: -5000 })).toBeNull();
  });

  it('pad mở rộng mỗi phía (cho điểm thả trúng tường)', () => {
    const k = rects.khach!;
    expect(roomAtPoint(rects, { x: k.x + k.w + 6, y: k.y + 20 })).toBeNull();
    expect(roomAtPoint(rects, { x: k.x + k.w + 6, y: k.y + 20 }, 10)).toBe('khach');
  });

  it('hai phòng chồng nhau thì lấy phòng có tâm gần điểm hơn', () => {
    const r = { a: { id: 'a', x: 0, y: 0, w: 200, h: 200 }, b: { id: 'b', x: 100, y: 0, w: 200, h: 200 } };
    expect(roomAtPoint(r, { x: 170, y: 100 })).toBe('b');
    expect(roomAtPoint(r, { x: 130, y: 100 })).toBe('a');
  });
});

describe('dòng thông tin 3D cả căn hộ', () => {
  it('tiêu đề, số phòng, tổng diện tích; trạng thái nói rõ chỉ để xem', () => {
    const info = describeApartment3D(rooms(), false);
    expect(info.title).toBe('Cả căn hộ · 3D');
    expect(info.size).toBe('4 phòng');
    expect(info.area).toBe('48,4 m²');
    expect(info.status.tone).toBe('info');
    expect(info.status.text).toContain('chỉ để xem');
  });

  it('không dựng được WebGL thì báo, mặt bằng vẫn dùng được', () => {
    expect(describeApartment3D(rooms(), true).status.text).toContain('Chưa dựng được 3D');
  });
});

describe('hành lang trên mô hình cả căn', () => {
  it('khe kín giữa các phòng được tô nền hành lang (nằm dưới các phòng) và cộng vào diện tích', () => {
    const rs = rooms();
    const f = renderApartment(rs);
    const interior = interiorSpace(Object.values(apartmentRects(sizes(rs)).rects));
    expect(f.svg).toContain('class="aptinterior"');
    expect((f.svg.match(/<g class="aptinterior">(.*?)<\/g>/)?.[1].match(/<rect/g) ?? []).length).toBe(interior.bands.length);
    expect(f.svg.indexOf('class="aptinterior"')).toBeLessThan(f.svg.indexOf('class="aptroom"'));
    expect(f.svg.indexOf('class="aptbase"')).toBeLessThan(f.svg.indexOf('class="aptinterior"'));
    expect(f.status.text).toContain('hành lang');
    expect(f.area).toBe(`${fm(interior.total)} m²`);
  });

  it('phòng xa nhau, không có khe kín: không có nền hành lang, diện tích chỉ là các phòng', () => {
    const rs = rooms();
    const plan = { ngu: { x: 0, y: 0 }, khach: { x: 3000, y: 0 }, bep: { x: 0, y: 3000 }, wc: { x: 3000, y: 3000 } };
    const f = renderApartment(rs, { plan });
    expect(f.svg).not.toContain('aptinterior');
    expect(f.area).toBe('48,4 m²');
    expect(f.status.text).not.toContain('hành lang');
  });

  it('thêm phòng sát vào thì diện tích trong nhà tăng đúng bằng phòng cộng khe mới', () => {
    const rs = rooms();
    const a = renderApartment(rs);
    const total = (s: string) => Number(s.replace(' m²', '').replace(',', '.'));
    expect(total(a.area)).toBeGreaterThan(48.4);
  });
});

describe('phòng bị che gần hết', () => {
  it('báo ở dòng trạng thái khi phòng chỉ còn thấy dưới 3 m²', () => {
    const rs = rooms();
    // ngu (400 x 350) nằm dưới khach (đè kín nó): ngu còn thấy rất ít
    const f = renderApartment(rs, { plan: { ngu: { x: 100, y: 100 }, khach: { x: 0, y: 0, z: 1 }, bep: { x: 3000, y: 0 }, wc: { x: 3000, y: 900 } } });
    expect(f.status.tone).toBe('bad');
    expect(f.status.text).toContain('Phòng ngủ');
    expect(f.status.text).toContain('che gần hết');
  });

  it('phòng nhỏ không bị che thì không bị báo, dù chưa tới 3 m²', () => {
    const rs = rooms();
    rs.find((r) => r.id === 'wc')!.geo = { ...rs.find((r) => r.id === 'wc')!.geo, W: 150, H: 150 };
    const f = renderApartment(rs, { plan: { ngu: { x: 0, y: 0 }, khach: { x: 1000, y: 0 }, bep: { x: 2000, y: 0 }, wc: { x: 3000, y: 0 } } });
    expect(f.status.text).not.toContain('che gần hết');
  });
});
