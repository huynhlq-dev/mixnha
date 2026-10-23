import { describe, expect, it } from 'vitest';
import { freshLayout } from '../src/core/layout';
import { registry } from '../src/core/registry';
import { roomGeo } from '../src/core/room';
import type { Layout } from '../src/core/types';
import { ROOMS, type RoomTypeId } from '../src/data/rooms';
import { openRange } from '../src/core/geometry';
import { flipDoorHinge, moveOpening, setDoorSide, toggleDoorSwing } from '../src/core/ops';
import { dragOpeningWall, dragWall, grabOpeningWall, grabWall, renderElevation } from '../src/views/elevation';
import { dragOpeningPlan, dragPlan, grabOpeningPlan, grabPlan, renderPlan, rotationAt } from '../src/views/plan';
import { EDGE_FONT_MAX, edgeFontSize, edgeTag, gridLines, hdim, pickLabel, uprightAngle, vdim } from '../src/views/svg';

let uid = 1;
const nextUid = () => uid++;
const setup = (id: RoomTypeId) => {
  const layout = freshLayout(ROOMS[id], registry, nextUid);
  return { layout, R: roomGeo(ROOMS[id], layout) };
};
const plan = (layout: Layout, R: ReturnType<typeof roomGeo>, over: { sel?: { scope: 'floor'; uid: number } | null; dim?: boolean } = {}) =>
  renderPlan({ layout, R, reg: registry, sel: over.sel ?? null, dim: over.dim ?? true });

describe('mặt bằng', () => {
  it('vẽ đủ món, khung, kích thước phòng và dòng trạng thái của phòng ngủ mẫu', () => {
    const { layout, R } = setup('ngu');
    const f = plan(layout, R);
    for (const it of layout.items) expect(f.svg).toContain(`data-uid="${it.uid}"`);
    expect(f.title).toBe('Phòng ngủ');
    expect(f.size).toBe('400 × 350 cm');
    expect(f.area).toBe('14 m²');
    expect(f.status.tone).toBe('good');
    expect(f.status.text).toContain('Lối đi hẹp nhất là 62,5 cm, giữa Giường đôi và Bàn trang điểm');
    expect(f.status.text).toContain('Đồ chiếm 41% diện tích sàn.');
    expect(f.bounds).toEqual({ x: -50, y: -50, w: 500, h: 450 });
    expect(f.aria).toContain('Mặt bằng Phòng ngủ 400 x 350 cm');
  });

  it('món đang chọn có viền xanh, kích thước, khoảng cách tới bốn tường và tay nắm xoay', () => {
    const { layout, R } = setup('ngu');
    const bed = layout.items.find((i) => i.id === 'bed2')!; // x 200, y 115, 170 x 210
    const f = plan(layout, R, { sel: { scope: 'floor', uid: bed.uid } });
    expect(f.svg).toContain('stroke:var(--accent);stroke-width:3');
    expect(f.svg).toContain('class="rot-handle"');
    expect(f.svg).toContain('>170 cm<');
    expect(f.svg).toContain('>210 cm<');
    // trái 115, phải 115, trên 10, dưới 130
    expect((f.svg.match(/>115</g) ?? []).length).toBe(2);
    expect(f.svg).toContain('>10<');
    expect(f.svg).toContain('>130<');
  });

  it('tắt hiện kích thước thì không có đường kích thước của món đang chọn', () => {
    const { layout, R } = setup('ngu');
    const bed = layout.items.find((i) => i.id === 'bed2')!;
    const f = plan(layout, R, { sel: { scope: 'floor', uid: bed.uid }, dim: false });
    expect(f.svg).not.toContain('>170 cm<');
    expect(f.svg).not.toContain('>130<');
    expect(f.svg).toContain('class="rot-handle"');
  });

  it('món khóa có ổ khóa và không có tay nắm xoay', () => {
    const { layout, R } = setup('ngu');
    const bed = layout.items.find((i) => i.id === 'bed2')!;
    bed.locked = true;
    const f = plan(layout, R, { sel: { scope: 'floor', uid: bed.uid } });
    expect(f.svg).toContain('class="lock"');
    expect(f.svg).not.toContain('class="rot-handle"');
    expect(f.svg).toContain('đã khóa');
    const g2 = plan(setup('ngu').layout, R);
    expect(g2.svg).not.toContain('class="lock"');
  });

  it('món chồng lấn hoặc ra ngoài phòng bị đánh dấu cam và báo trong dòng trạng thái', () => {
    const { layout, R } = setup('ngu');
    layout.items[0]!.x = 0;
    layout.items[0]!.y = 0;
    const f = plan(layout, R);
    expect(f.status.tone).toBe('bad');
    expect(f.status.text).toMatch(/^\d+ món đang chồng lấn/);
    expect(f.svg).toContain('stroke:var(--warn);stroke-width:3');
  });

  it('lối đi dưới 60 cm cũng là cảnh báo, kèm đường đo màu cam', () => {
    const { layout, R } = setup('ngu');
    const bed = layout.items.find((i) => i.id === 'bed2')!;
    const dress = layout.items.find((i) => i.id === 'dress')!;
    layout.items = [bed, dress];
    bed.x = 100; // chiếm x 15 đến 185
    bed.y = 115;
    dress.x = 275; // rộng 100, chiếm x 225 đến 325 (rot 0), cách giường 40 cm
    dress.y = 100;
    dress.rot = 0;
    const f = plan(layout, R);
    expect(f.status.tone).toBe('bad');
    expect(f.status.text).toContain('Lối đi giữa Giường đôi và Bàn trang điểm chỉ rộng 40 cm. Nên chừa từ 60 cm.');
    expect(f.svg).toContain('fill:var(--warn)');
    expect(f.svg).toContain('>40<');
  });

  it('tên món có ký tự đặc biệt được mã hóa, không chèn được mã HTML', () => {
    const { layout, R } = setup('ngu');
    layout.items[0]!.name = 'A<img src=x onerror=alert(1)>"&';
    const f = plan(layout, R);
    expect(f.svg).not.toContain('<img');
    expect(f.svg).toContain('&lt;img');
  });

  it('thảm nằm dưới (z = 0) vẽ nét đứt và nằm trước trong thứ tự vẽ', () => {
    const { layout, R } = setup('khach');
    const rug = layout.items.find((i) => i.z === 0);
    expect(rug).toBeDefined();
    const f = plan(layout, R);
    const iRug = f.svg.indexOf(`data-uid="${rug!.uid}"`);
    const others = layout.items.filter((i) => i.z === 1).map((i) => f.svg.indexOf(`data-uid="${i.uid}"`));
    expect(others.every((p) => p > iRug)).toBe(true);
    expect(f.svg).toContain('stroke-dasharray="6 4"');
  });

  it('kéo: bám lưới theo mép hộp bao quanh và giữ tâm trong phòng', () => {
    const R = { W: 400, H: 350 };
    const it = { x: 200, y: 115, w: 170, d: 210, rot: 0 };
    const g = grabPlan(it, { x: 190, y: 100 });
    expect(g).toEqual({ dx: 10, dy: 15 });
    // tâm tới (248, 123): mép trái 163 bám về 165 => tâm x 250; mép trên 18 bám về 20 => tâm y 125
    const p = dragPlan(it, { x: 238, y: 108 }, g, R, true);
    expect(p).toEqual({ x: 250, y: 125 });
    expect(dragPlan(it, { x: 238.4, y: 108.2 }, g, R, false)).toEqual({ x: 248.4, y: 123.2 });
    expect(dragPlan(it, { x: 9999, y: -9999 }, g, R, true)).toEqual({ x: 400, y: 0 });
  });

  it('xoay: hướng con trỏ quyết định góc, bám 45 độ, Shift nhảy 15', () => {
    const it = { x: 100, y: 100 };
    expect(rotationAt(it, { x: 100, y: 0 }, false, true)).toBe(0);
    expect(rotationAt(it, { x: 200, y: 100 }, false, true)).toBe(90);
    expect(rotationAt(it, { x: 100, y: 200 }, false, true)).toBe(180);
    expect(rotationAt(it, { x: 0, y: 100 }, false, true)).toBe(270);
    expect(rotationAt(it, { x: 200, y: 98 }, false, false)).toBeCloseTo(88.9, 0);
    expect(rotationAt(it, { x: 200, y: 98 }, false, true)).toBe(90);
    expect(rotationAt(it, { x: 190, y: 40 }, true, true) % 15).toBe(0);
  });
});

describe('mặt đứng', () => {
  const elev = (id: RoomTypeId, wall: 'T' | 'R' | 'B' | 'L', selUid: number | null = null, dim = true) => {
    const { layout, R } = setup(id);
    return { layout, R, f: renderElevation({ layout, R, reg: registry, wall, sel: selUid === null ? null : { scope: wall, uid: selUid }, dim }) };
  };

  it('bếp: có vạch mặt bếp 85, cửa sổ hoặc cửa và món gắn tường', () => {
    const { layout, f } = elev('bep', 'T');
    expect(f.svg).toContain('mặt bếp 85');
    for (const it of layout.walls.T) expect(f.svg).toContain(`data-uid="${it.uid}"`);
    expect(f.title).toBe('Bếp và ăn · Tường trên');
    expect(f.bounds.w).toBe(ROOMS.bep.W + 100);
    expect(f.bounds.h).toBe(ROOMS.bep.ceil + 100);
    expect(f.area).toMatch(/m² tường$/);
  });

  it('phòng không có vạch tham chiếu thì không vẽ vạch', () => {
    const { f } = elev('ngu', 'T');
    expect(f.svg).not.toContain('mặt bếp');
  });

  it('đồ sàn trong 1 m cách tường hiện mờ nét đứt kèm chữ (sàn)', () => {
    const { layout, R } = setup('ngu');
    const wardrobe = layout.items.find((i) => i.id === 'ward4')!;
    expect(wardrobe).toBeDefined();
    const f = renderElevation({ layout, R, reg: registry, wall: 'B', sel: null, dim: true });
    expect(f.svg).toContain('(sàn)');
    expect(f.svg).toContain('stroke-dasharray:4 3');
  });

  it('món đang chọn: kích thước, cao độ so với sàn, khoảng cách tới hai đầu tường và trần', () => {
    const { layout, R } = setup('ngu');
    const ac = layout.walls.L[0]!; // Điều hòa x 175, y 220, 90 x 30
    const f = renderElevation({ layout, R, reg: registry, wall: 'L', sel: { scope: 'L', uid: ac.uid }, dim: true });
    expect(f.svg).toContain('>90 cm<');
    expect(f.svg).toContain('>30 cm<');
    // tường trái dài 350; điều hòa chiếm 130..220 theo chiều ngang; trần 270 - (220+30) = 20
    expect(f.svg).toContain('>130<');
    expect(f.svg).toContain('>20<');
    expect(f.svg).toContain('stroke:var(--accent);stroke-width:3');
  });

  it('món không chọn khi đang xem tường khác thì không có viền xanh', () => {
    const { layout, R } = setup('ngu');
    const ac = layout.walls.L[0]!;
    const f = renderElevation({ layout, R, reg: registry, wall: 'R', sel: { scope: 'L', uid: ac.uid }, dim: true });
    expect(f.svg).not.toContain('stroke:var(--accent)');
  });

  it('món vượt trần bị báo', () => {
    const { layout, R } = setup('ngu');
    layout.walls.L[0]!.y = 400;
    const f = renderElevation({ layout, R, reg: registry, wall: 'L', sel: null, dim: true });
    expect(f.status.tone).toBe('bad');
    expect(f.status.text).toContain('vượt ra ngoài tường');
  });

  it('món khóa có ổ khóa', () => {
    const { layout, R } = setup('ngu');
    layout.walls.L[0]!.locked = true;
    const f = renderElevation({ layout, R, reg: registry, wall: 'L', sel: null, dim: true });
    expect(f.svg).toContain('class="lock"');
  });

  it('kéo: đổi hướng y của SVG sang độ cao so với sàn, bám lưới và kẹp trong tường', () => {
    const it = { x: 175, y: 220, w: 90, h: 30 };
    const size = { len: 350, ceil: 270 };
    const g = grabWall(it, { x: 170, y: 40 }, 270); // cao độ con trỏ 230 so với sàn, mép dưới món ở 220, dy = 10
    expect(g).toEqual({ dx: 5, dy: 10 });
    const p = dragWall(it, { x: 100, y: 100 }, g, size, false);
    expect(p).toEqual({ x: 105, y: 160 }); // con trỏ ở cao độ 170, trừ dy
    const q = dragWall(it, { x: 100, y: 100 }, g, size, true);
    expect(q.y % 5).toBe(0);
    expect((q.x - 45) % 5).toBe(0);
    expect(dragWall(it, { x: -500, y: -500 }, g, size, true)).toEqual({ x: 0, y: 240 });
    expect(dragWall(it, { x: 9999, y: 9999 }, g, size, true)).toEqual({ x: 350, y: 0 });
  });
});

describe('hàm vẽ SVG dùng chung', () => {
  it('pickLabel: tên đầy đủ, rồi xoay dọc, rồi tên ngắn, rồi bỏ', () => {
    expect(pickLabel('Giường đôi', 'Giường', 170, 210)).toEqual({ t: 'Giường đôi', rot: false });
    expect(pickLabel('Bàn trang điểm', 'Trang điểm', 100, 45)).toEqual({ t: 'Bàn trang điểm', rot: false });
    // hẹp ngang nhưng cao: xoay dọc
    expect(pickLabel('Tủ quần áo', 'Tủ áo', 40, 140)).toEqual({ t: 'Tủ quần áo', rot: true });
    // quá nhỏ cho mọi nhãn
    expect(pickLabel('Tủ quần áo', 'Tủ áo', 20, 20)).toBeNull();
    // không đủ cho tên đầy đủ, vừa tên ngắn
    expect(pickLabel('Bàn trang điểm rất dài', 'Bàn', 60, 40)).toEqual({ t: 'Bàn', rot: false });
  });

  it('hdim, vdim và gridLines: số làm tròn, chữ được mã hóa', () => {
    expect(hdim(0, 100.123456, 10, '1 < 2', 'red')).toContain('&lt;');
    expect(hdim(0, 100.123456, 10, 'x', 'red')).toContain('H100.12');
    expect(vdim(0, 50, 10, '50', 'red', -1)).toContain('rotate(-90)');
    expect(vdim(0, 50, 10, '50', 'red', 1)).toContain('rotate(90)');
    expect(hdim(0, 10, 0, 'x', 'red', true)).toContain('stroke-dasharray:3 3');
    expect((gridLines(200, 100).match(/<path/g) ?? []).length).toBe(3 + 1);
    expect(gridLines(100, 200, true)).toContain('M0 150H100');
  });
});

describe('cửa đi và cửa sổ trên bản vẽ', () => {
  const planOf = (layout: Layout, R: ReturnType<typeof roomGeo>, opening: { kind: 'door' | 'win'; uid: number } | null = null, dim = true) =>
    renderPlan({ layout, R, reg: registry, sel: null, opening, dim });
  const planWith = (layout: Layout) => planOf(layout, roomGeo(ROOMS.ngu, layout));

  it('mặt bằng: mỗi cửa là một nhóm chọn được, có tên đọc được', () => {
    const { layout, R } = setup('ngu');
    const f = planOf(layout, R);
    expect((f.svg.match(/class="op"/g) ?? []).length).toBe(2);
    expect(f.svg).toContain(`data-kind="door" data-uid="${layout.doors[0]!.uid}"`);
    expect(f.svg).toContain(`data-kind="win" data-uid="${layout.windows[0]!.uid}"`);
    expect(f.svg).toContain('aria-label="Cửa đi, tường dưới, rộng 80 cm"');
    expect(f.svg).toContain('aria-label="Cửa sổ, tường trên, rộng 180 cm"');
    expect(f.status.tone).toBe('good');
  });

  it('cửa đi: hình quạt cánh cửa quét cũng là vùng bấm chọn (nền trong suốt, nằm trong nhóm của cửa)', () => {
    const { layout, R } = setup('ngu');
    const svg = planOf(layout, R).svg;
    const group = new RegExp(`<g class="op" data-kind="door" data-uid="${layout.doors[0]!.uid}".*?</g>`).exec(svg)![0];
    // bản lề (30,350), đầu cánh đóng (110,350), cung tới đầu cánh mở (30,270)
    expect(group).toContain('<path d="M30 350L110 350A80 80 0 0 0 30 270Z" style="fill:transparent;stroke:transparent;stroke-width:6"/>');
    // cửa sổ chỉ là một khe trên tường nên không có hình quạt
    const win = new RegExp(`<g class="op" data-kind="win" data-uid="${layout.windows[0]!.uid}".*?</g>`).exec(svg)![0];
    expect(win).not.toContain('Z"');
  });

  it('hình quạt đổi theo bản lề và hướng mở', () => {
    const { layout } = setup('ngu');
    const door = layout.doors[0]!;
    door.hinge = 'end';
    expect(planWith(layout).svg).toContain('<path d="M110 350L30 350A80 80 0 0 1 110 270Z" style="fill:transparent;stroke:transparent;stroke-width:6"/>');
    door.swing = 'out';
    expect(planWith(layout).svg).toContain('<path d="M110 360L30 360A80 80 0 0 0 110 440Z" style="fill:transparent;stroke:transparent;stroke-width:6"/>');
  });

  it('cửa chưa chọn thì không có viền xanh hay đường kích thước của cửa', () => {
    const { layout, R } = setup('ngu');
    const f = planOf(layout, R);
    expect(f.svg).not.toContain('stroke:var(--accent);stroke-width:3');
    expect(f.svg).not.toContain('>80 cm<');
  });

  it('cửa đang chọn: viền xanh, chiều rộng và khoảng tới hai góc (cửa dưới: 30 | 80 | 290)', () => {
    const { layout, R } = setup('ngu');
    const f = planOf(layout, R, { kind: 'door', uid: layout.doors[0]!.uid });
    expect(f.svg).toContain('stroke:var(--accent);stroke-width:3');
    expect(f.svg).toContain('>80 cm<');
    expect(f.svg).toContain('>30<');
    expect(f.svg).toContain('>290<');
    expect(planOf(layout, R, { kind: 'door', uid: layout.doors[0]!.uid }, false).svg).not.toContain('>80 cm<');
  });

  it('cửa sổ đang chọn trên tường trên: 110 | 180 | 110; tường trái đo từ góc trên', () => {
    const { layout, R } = setup('ngu');
    let f = planOf(layout, R, { kind: 'win', uid: layout.windows[0]!.uid });
    expect(f.svg).toContain('>180 cm<');
    expect((f.svg.match(/>110</g) ?? []).length).toBe(2);
    moveOpening(layout, layout.windows[0]!, 'L', 60, true);
    f = planOf(layout, roomGeo(ROOMS.ngu, layout), { kind: 'win', uid: layout.windows[0]!.uid });
    expect(f.svg).toContain('>60<'); // cách góc trên
    expect(f.svg).toContain('>110<'); // 350 - 60 - 180
  });

  it('cửa chồng lên nhau: viền cam và báo trong dòng trạng thái', () => {
    const { layout, R } = setup('ngu');
    moveOpening(layout, layout.doors[0]!, 'T', 150, true);
    const f = planOf(layout, roomGeo(ROOMS.ngu, layout));
    expect(f.status.tone).toBe('bad');
    expect(f.status.text).toContain('chồng lên nhau');
    expect(f.svg).toContain('stroke:var(--warn);stroke-width:3');
    expect(R.doors[0]!.wall).toBe('B'); // R cũ không bị đổi
  });

  it('kéo cửa trên mặt bằng: giữ chỗ nắm khi còn ở tường cũ, sang tường khác thì cửa nằm giữa con trỏ', () => {
    const R = { W: 400, H: 350 };
    const door = { wall: 'B' as const, pos: 30, w: 80 };
    const grab = grabOpeningPlan(door, { x: 50, y: 350 });
    expect(grab).toBe(20);
    expect(dragOpeningPlan(door, { x: 170, y: 345 }, grab, R)).toEqual({ wall: 'B', pos: 150 });
    expect(dragOpeningPlan(door, { x: 4, y: 200 }, grab, R)).toEqual({ wall: 'L', pos: 160 });
    expect(dragOpeningPlan(door, { x: 200, y: 6 }, grab, R)).toEqual({ wall: 'T', pos: 160 });
    expect(dragOpeningPlan({ wall: 'R', w: 60 }, { x: 395, y: 300 }, 10, R)).toEqual({ wall: 'R', pos: 290 });
  });

  it('mặt đứng: có nhóm chọn được, đang chọn thì có viền xanh và đường kích thước', () => {
    const { layout, R } = setup('ngu');
    const win = layout.windows[0]!;
    const base = { layout, R, reg: registry, wall: 'T' as const, sel: null, dim: true };
    const f0 = renderElevation(base);
    expect(f0.svg).toContain(`data-kind="win" data-uid="${win.uid}"`);
    expect(f0.svg).toContain('aria-label="Cửa sổ, tường trên, rộng 180 cm"');
    expect(f0.svg).not.toContain('class="op" data-kind="door"');
    expect(f0.svg).not.toContain('stroke:var(--accent);stroke-width:3');
    const f1 = renderElevation({ ...base, opening: { kind: 'win', uid: win.uid } });
    expect(f1.svg).toContain('stroke:var(--accent);stroke-width:3');
    expect(f1.svg).toContain('>180 cm<');
    expect(f1.svg).toContain('>110<');
    expect(renderElevation({ ...base, opening: { kind: 'win', uid: win.uid }, dim: false }).svg).not.toContain('>180 cm<');
    // tường dưới có cửa đi, tường khác không
    const f2 = renderElevation({ ...base, wall: 'B' });
    expect(f2.svg).toContain('data-kind="door"');
    expect(f2.svg).not.toContain('data-kind="win"');
  });

  it('mặt đứng: cửa chồng nhau thì báo', () => {
    const { layout } = setup('ngu');
    moveOpening(layout, layout.doors[0]!, 'T', 150, true);
    const R = roomGeo(ROOMS.ngu, layout);
    const f = renderElevation({ layout, R, reg: registry, wall: 'T', sel: null, dim: true });
    expect(f.status.tone).toBe('bad');
    expect(f.status.text).toContain('chồng lên nhau');
  });

  it('kéo cửa trên mặt đứng: tường dưới và trái đảo chiều so với pos', () => {
    const R = { W: 400, H: 350 };
    for (const [wall, sign] of [['T', 1], ['R', 1], ['B', -1], ['L', -1]] as const) {
      const d = { wall, pos: 40, w: 80 };
      const s0 = openRange(R, d)[0];
      const grab = grabOpeningWall(s0, { x: s0 + 10 });
      expect(grab).toBe(-10);
      // không nhúc nhích thì pos không đổi
      expect(dragOpeningWall(R, d, { x: s0 + 10 }, grab)).toBe(40);
      // kéo sang phải 25 cm trên mặt đứng
      expect(dragOpeningWall(R, d, { x: s0 + 35 }, grab)).toBe(40 + sign * 25);
    }
  });
});

describe('hướng mở cánh cửa đi trên bản vẽ', () => {
  const planOf = (layout: Layout) => renderPlan({ layout, R: roomGeo(ROOMS.ngu, layout), reg: registry, sel: null, dim: true });

  it('mặt bằng: cung và cánh đổi theo bản lề (cửa dưới, pos 30, rộng 80)', () => {
    const { layout } = setup('ngu');
    expect(planOf(layout).svg).toContain('M110 350A80 80 0 0 0 30 270M30 350L30 270');
    flipDoorHinge(layout.doors[0]!);
    expect(planOf(layout).svg).toContain('M30 350A80 80 0 0 1 110 270M110 350L110 270');
  });

  it('mở ra ngoài: cung nằm ngoài phòng, khung nới ra đủ chỗ, vùng mở cửa không còn trong phòng', () => {
    const { layout } = setup('ngu');
    expect(planOf(layout).bounds).toEqual({ x: -50, y: -50, w: 500, h: 450 });
    toggleDoorSwing(layout.doors[0]!);
    const f = planOf(layout);
    expect(f.svg).toContain('M110 360A80 80 0 0 1 30 440M30 360L30 440');
    // tường dưới cần 10 + 80 cm vòng quét, chừa thêm 22 cm
    expect(f.bounds).toEqual({ x: -50, y: -50, w: 500, h: 350 + 50 + 112 });
    expect(f.status.tone).toBe('good');
  });

  it('cánh mở ra ngoài ở tường trên: đường kích thước tổng dời ra ngoài vòng quét và khung nới theo', () => {
    const { layout } = setup('ngu');
    moveOpening(layout, layout.doors[0]!, 'T', 300, true);
    setDoorSide(layout.doors[0]!, 'start', 'out');
    const f = planOf(layout);
    expect(f.svg).toContain('M0 -104H400');
    expect(f.bounds.y).toBe(-126);
    // không có cánh ra ngoài ở tường trái nên đường kích thước dọc và lề trái giữ nguyên
    expect(f.svg).toContain('M-30 0V350');
    expect(f.bounds.x).toBe(-50);
  });

  it('mặt đứng: tay nắm nằm phía đối diện bản lề', () => {
    const { layout } = setup('ngu');
    const handleX = (wall: 'B' | 'T') => {
      const R = roomGeo(ROOMS.ngu, layout);
      return Number(/<circle cx="(-?[\d.]+)" cy="[\d.]+" r="3"/.exec(renderElevation({ layout, R, reg: registry, wall, sel: null, dim: true }).svg)![1]);
    };
    // tường dưới: pos 30, rộng 80, W 400 nên trên mặt đứng cửa chiếm 290 đến 370; bản lề gần góc nằm bên phải, tay nắm bên trái
    expect(handleX('B')).toBe(298);
    flipDoorHinge(layout.doors[0]!);
    expect(handleX('B')).toBe(362);
    moveOpening(layout, layout.doors[0]!, 'T', 300, true); // tường trên chiếm 300 đến 380
    expect(handleX('T')).toBe(308); // bản lề giờ ở đầu xa (bên phải), tay nắm bên trái
    flipDoorHinge(layout.doors[0]!);
    expect(handleX('T')).toBe(372);
  });
});

describe('kích thước chi tiết trên cạnh của món đang chọn', () => {
  const planWith = (layout: Layout, uid: number | null, over: { detail?: boolean; dim?: boolean } = {}) =>
    renderPlan({ layout, R: roomGeo(ROOMS.ngu, layout), reg: registry, sel: uid === null ? null : { scope: 'floor', uid }, dim: over.dim ?? true, detail: over.detail });
  const tags = (svg: string) => [...svg.matchAll(/<g class="edgetag" data-kind="(\w)" transform="translate\((-?[\d.]+) (-?[\d.]+)\) rotate\((-?[\d.]+)\)"[^>]*>.*?<rect[^>]* width="([\d.]+)"[^>]*\/>.*?>([^<]+)<\/text>/g)].map((m) => ({ kind: m[1], x: Number(m[2]), y: Number(m[3]), angle: Number(m[4]), pill: Number(m[5]), text: m[6] }));
  const nums = (svg: string) => tags(svg).map(({ kind, x, y, angle, text }) => ({ kind, x, y, angle, text }));

  it('uprightAngle đưa góc về (-90, 90] để chữ không bao giờ lộn ngược', () => {
    expect(uprightAngle(0)).toBe(0);
    expect(uprightAngle(90)).toBe(90);
    expect(uprightAngle(91)).toBe(-89);
    expect(uprightAngle(180)).toBe(0);
    expect(uprightAngle(270)).toBe(90);
    expect(uprightAngle(271)).toBe(-89);
    expect(uprightAngle(359)).toBe(-1);
    expect(uprightAngle(-90)).toBe(90);
    expect(uprightAngle(450)).toBe(90);
    for (let d = -720; d <= 720; d += 7) {
      const u = uprightAngle(d);
      expect(u).toBeGreaterThan(-90);
      expect(u).toBeLessThanOrEqual(90);
    }
  });

  it('edgeFontSize: cạnh dài thì chữ cỡ tối đa, cạnh ngắn thì chữ co lại, không bao giờ bằng 0', () => {
    expect(edgeFontSize(500, 3)).toBe(EDGE_FONT_MAX);
    expect(edgeFontSize(40, 2)).toBe(EDGE_FONT_MAX);
    expect(edgeFontSize(10, 2)).toBeLessThan(EDGE_FONT_MAX);
    expect(edgeFontSize(10, 2)).toBeCloseTo(4.25, 2);
    expect(edgeFontSize(0, 3)).toBe(0.5);
    // càng nhiều chữ số hoặc cạnh càng ngắn thì chữ càng nhỏ
    expect(edgeFontSize(30, 5)).toBeLessThan(edgeFontSize(30, 2));
    expect(edgeFontSize(20, 3)).toBeLessThan(edgeFontSize(40, 3));
  });

  it('nhãn luôn ngắn hơn cạnh của nó: mọi độ dài cạnh từ 5 đến 600 cm, 1 đến 6 ký tự', () => {
    for (let len = 5; len <= 600; len += 5) {
      for (let chars = 1; chars <= 6; chars++) {
        const text = '8'.repeat(chars);
        const m = /<rect[^>]* width="([\d.]+)"/.exec(edgeTag(0, 0, 0, text, 'w', len))!;
        expect(Number(m[1])).toBeLessThan(len);
        expect(Number(m[1])).toBeLessThanOrEqual(len * 0.85 + 0.02);
      }
    }
  });

  it('edgeTag: chỉ có số, mờ một chút, không bắt chuột, chữ co theo cạnh và được thoát ký tự HTML', () => {
    const s = edgeTag(10, 20, 180, '<b>1</b>', 'w', 300);
    expect(s).toContain('class="edgetag" data-kind="w" transform="translate(10 20) rotate(0)"');
    expect(s).toContain('opacity:.88;pointer-events:none');
    expect(s).toContain('fill-opacity:.72');
    expect(s).not.toContain('<b>');
    const big = edgeTag(0, 0, 0, '170', 'w', 170);
    const small = edgeTag(0, 0, 0, '45', 'w', 12);
    expect(big).toContain('font-size="10"');
    expect(Number(/font-size="([\d.]+)"/.exec(small)![1])).toBeLessThan(10);
    expect(big).toContain('>170<');
    expect(big).not.toContain('cm');
  });

  it('tắt tùy chọn hoặc không chọn món thì không có nhãn nào', () => {
    const { layout } = setup('ngu');
    const bed = layout.items.find((i) => i.id === 'bed2')!;
    expect(planWith(layout, bed.uid).svg).not.toContain('edgetag');
    expect(planWith(layout, null, { detail: true }).svg).not.toContain('edgetag');
  });

  it('bật: hai nhãn chỉ có số, ở giữa cạnh dưới (rộng) và cạnh phải (sâu); giường 170 x 210 ở (200, 115)', () => {
    const { layout } = setup('ngu');
    const bed = layout.items.find((i) => i.id === 'bed2')!;
    expect(nums(planWith(layout, bed.uid, { detail: true }).svg)).toEqual([
      { kind: 'w', x: 200, y: 220, angle: 0, text: '170' },
      { kind: 'd', x: 285, y: 115, angle: 90, text: '210' },
    ]);
  });

  it('món xoay: nhãn xoay theo cạnh và chữ luôn đọc xuôi', () => {
    const { layout } = setup('ngu');
    const bed = layout.items.find((i) => i.id === 'bed2')!;
    bed.rot = 90;
    expect(nums(planWith(layout, bed.uid, { detail: true }).svg)).toEqual([
      { kind: 'w', x: 95, y: 115, angle: 90, text: '170' },
      { kind: 'd', x: 200, y: 200, angle: 0, text: '210' },
    ]);
    bed.rot = 180;
    expect(nums(planWith(layout, bed.uid, { detail: true }).svg)).toEqual([
      { kind: 'w', x: 200, y: 10, angle: 0, text: '170' },
      { kind: 'd', x: 115, y: 115, angle: 90, text: '210' },
    ]);
    bed.rot = 45;
    expect(tags(planWith(layout, bed.uid, { detail: true }).svg).map((x) => x.angle)).toEqual([45, -45]);
  });

  it('món nhỏ: số co lại cho lọt cạnh (táp đầu giường 45 x 40), món lớn giữ cỡ tối đa', () => {
    const { layout } = setup('ngu');
    const night = layout.items.find((i) => i.id === 'night')!;
    night.w = 12;
    night.d = 9;
    const small = tags(planWith(layout, night.uid, { detail: true }).svg);
    expect(small.map((t) => t.text)).toEqual(['12', '9']);
    expect(small[0]!.pill).toBeLessThan(12);
    expect(small[1]!.pill).toBeLessThan(9);
    const bed = layout.items.find((i) => i.id === 'bed2')!;
    const big = tags(planWith(layout, bed.uid, { detail: true }).svg);
    expect(big[0]!.pill).toBeLessThan(170);
    // cùng số ký tự, cạnh dài hơn thì viên nhãn không nhỏ hơn
    expect(big[0]!.pill).toBeGreaterThan(small[0]!.pill);
  });

  it('khi bật, hai đường kích thước tách rời của món không vẽ nữa (đã có nhãn), khoảng cách tới tường vẫn còn', () => {
    const { layout } = setup('ngu');
    const bed = layout.items.find((i) => i.id === 'bed2')!;
    const withLines = planWith(layout, bed.uid).svg;
    const withTags = planWith(layout, bed.uid, { detail: true }).svg;
    const halo = /paint-order:stroke[^>]*>170 cm</;
    expect(halo.test(withLines)).toBe(true);
    expect(halo.test(withTags)).toBe(false);
    expect(withTags).toContain('>130<'); // cách tường dưới
    expect(withTags).toContain('>115<'); // cách tường trái
  });

  it('chỉ bật nhãn, tắt "Hiện kích thước": có nhãn trên cạnh, không có khoảng cách tới tường', () => {
    const { layout } = setup('ngu');
    const bed = layout.items.find((i) => i.id === 'bed2')!;
    const svg = planWith(layout, bed.uid, { detail: true, dim: false }).svg;
    expect(tags(svg)).toHaveLength(2);
    expect(svg).not.toContain('>130<');
  });

  it('mặt đứng: hai nhãn chỉ có số, rộng ở cạnh dưới và cao ở cạnh phải', () => {
    const { layout, R } = setup('ngu');
    const mirror = layout.walls.R[0]!; // gương tường phải
    const base = { layout, R, reg: registry, wall: 'R' as const, sel: { scope: 'R' as const, uid: mirror.uid }, dim: true };
    expect(renderElevation(base).svg).not.toContain('edgetag');
    const t = nums(renderElevation({ ...base, detail: true }).svg);
    expect(t).toEqual([
      { kind: 'w', x: mirror.x, y: 270 - mirror.y, angle: 0, text: String(mirror.w) },
      { kind: 'h', x: mirror.x + mirror.w / 2, y: 270 - (mirror.y + mirror.h / 2), angle: 90, text: String(mirror.h) },
    ]);
  });
});
