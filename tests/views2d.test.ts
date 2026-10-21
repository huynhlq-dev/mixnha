import { describe, expect, it } from 'vitest';
import { freshLayout } from '../src/core/layout';
import { registry } from '../src/core/registry';
import { roomGeo } from '../src/core/room';
import type { Layout } from '../src/core/types';
import { ROOMS, type RoomId } from '../src/data/rooms';
import { dragWall, grabWall, renderElevation } from '../src/views/elevation';
import { dragPlan, grabPlan, renderPlan, rotationAt } from '../src/views/plan';
import { gridLines, hdim, pickLabel, vdim } from '../src/views/svg';

let uid = 1;
const nextUid = () => uid++;
const setup = (id: RoomId) => {
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
  const elev = (id: RoomId, wall: 'T' | 'R' | 'B' | 'L', selUid: number | null = null, dim = true) => {
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
