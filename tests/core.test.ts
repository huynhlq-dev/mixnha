import { describe, expect, it } from 'vitest';
import { ROOMS, ROOM_IDS } from '../src/data/rooms';
import type { ItemDef } from '../src/data/schema';
import { analysePlan, analyseWall } from '../src/core/analyse';
import { boxOf, normDeg, polyOf, satHit, snapAngle, wallLength } from '../src/core/geometry';
import { canEdit, clearAll, clearScope, cloneLayout, duplicateItem, findItem, freshLayout, isUsableLayout, makeFloorItem, maxUid, removeItem, setRoomDim, snapValue } from '../src/core/layout';
import { planGaps, wallGaps } from '../src/core/measure';
import { createRegistry, registry } from '../src/core/registry';
import { roomGeo } from '../src/core/room';
import { CATEGORIES } from '../src/data/categories';
import { fm, plain } from '../src/core/format';
import { hexMix, luminance, normHex } from '../src/core/color';

let uid = 1;
const nextUid = () => uid++;
const ngu = () => freshLayout(ROOMS.ngu, registry, nextUid);
const geoOf = (id: (typeof ROOM_IDS)[number], l = freshLayout(ROOMS[id], registry, nextUid)) => ({ l, R: roomGeo(ROOMS[id], l) });

describe('hình học', () => {
  it('boxOf đổi chỗ rộng và sâu khi xoay 90 độ', () => {
    const b = boxOf({ x: 100, y: 100, w: 200, d: 60, rot: 90 });
    expect(b.w).toBeCloseTo(60);
    expect(b.h).toBeCloseTo(200);
    expect(b.x0).toBeCloseTo(70);
    expect(b.y0).toBeCloseTo(0);
  });
  it('satHit: chạm mép không tính, lấn quá 0,5 cm thì tính', () => {
    const a = polyOf({ x: 50, y: 50, w: 100, d: 100, rot: 0 });
    expect(satHit(a, polyOf({ x: 150, y: 50, w: 100, d: 100, rot: 0 }))).toBe(false);
    expect(satHit(a, polyOf({ x: 148, y: 50, w: 100, d: 100, rot: 0 }))).toBe(true);
  });
  it('satHit đúng với món xoay chéo', () => {
    const a = polyOf({ x: 100, y: 100, w: 100, d: 20, rot: 45 });
    expect(satHit(a, polyOf({ x: 100, y: 100, w: 20, d: 20, rot: 0 }))).toBe(true);
    // hai góc của hình chữ nhật ngang dọc chồng nhau nhưng thanh xoay 45° thực ra không chạm
    expect(satHit(polyOf({ x: 100, y: 100, w: 140, d: 10, rot: 45 }), polyOf({ x: 140, y: 60, w: 20, d: 20, rot: 0 }))).toBe(false);
  });
  it('snapAngle: hút về bội của 45 trong ±3 độ, Shift nhảy 15, tắt bám lưới thì mịn', () => {
    expect(snapAngle(88, false, true)).toBe(90);
    expect(snapAngle(80, false, true)).toBe(80);
    expect(snapAngle(88, false, false)).toBe(88);
    expect(snapAngle(52, true, true)).toBe(45);
    expect(normDeg(-90)).toBe(270);
  });
  it('wallLength', () => {
    expect(wallLength({ W: 400, H: 350 }, 'T')).toBe(400);
    expect(wallLength({ W: 400, H: 350 }, 'L')).toBe(350);
  });
});

describe('màu và định dạng', () => {
  it('normHex', () => {
    expect(normHex('#ABC')).toBe('#aabbcc');
    expect(normHex(' #8FB4D9 ')).toBe('#8fb4d9');
    expect(normHex('red')).toBeNull();
    expect(normHex('#12345')).toBeNull();
  });
  it('hexMix và luminance', () => {
    expect(hexMix('#000000', 1)).toBe('#ffffff');
    expect(hexMix('#102030', 0)).toBe('#102030');
    expect(luminance('#ffffff')).toBeCloseTo(1);
    expect(luminance('#000000')).toBeCloseTo(0);
  });
  it('fm và plain', () => {
    expect(fm(62.5)).toBe('62,5');
    expect(fm(60)).toBe('60');
    expect(plain('Đèn Bàn Trang Điểm')).toBe('den ban trang diem');
  });
});

describe('thư viện đồ (registry)', () => {
  const live: ItemDef = { id: 'new1', name: 'Mới', cat: 'sleeping', place: 'floor', w: 100, d: 50, h: 40, color: '#112233', status: 'live' };
  const old: ItemDef = { ...live, id: 'old1', status: 'retired', replacedBy: 'new1' };
  const draft: ItemDef = { ...live, id: 'dr1', status: 'draft' };
  const reg = createRegistry([old, live, draft], CATEGORIES);
  it('resolve đi theo replacedBy', () => {
    expect(reg.resolve('old1')?.id).toBe('new1');
    expect(reg.resolve('new1')?.id).toBe('new1');
    expect(reg.get('old1')?.status).toBe('retired');
  });
  it('mã lạ thì không có', () => {
    expect(reg.resolve('ghost')).toBeUndefined();
  });
  it('thư viện chỉ hiện món live', () => {
    expect(reg.live().map((i) => i.id)).toEqual(['new1']);
  });
  it('vòng lặp replacedBy không treo', () => {
    const a: ItemDef = { ...live, id: 'a', status: 'retired', replacedBy: 'b' };
    const b: ItemDef = { ...live, id: 'b', status: 'retired', replacedBy: 'a' };
    expect(createRegistry([a, b], CATEGORIES).resolve('a')).toBeUndefined();
  });
  it('thư viện thật: mỗi nhóm có món', () => {
    for (const c of CATEGORIES) expect(registry.live(c.place).some((i) => i.cat === c.id)).toBe(true);
  });
});

describe('bố trí mẫu và phân tích mặt bằng', () => {
  it('phòng ngủ mẫu: không chồng lấn, lối đi hẹp nhất 62,5 cm giữa giường và bàn trang điểm', () => {
    const { l, R } = geoOf('ngu');
    const a = analysePlan(l, R, registry);
    expect(a.bad.size).toBe(0);
    expect(a.gap?.dist).toBe(62.5);
    expect([a.gap?.a, a.gap?.b].sort()).toEqual(['Bàn trang điểm', 'Giường đôi']);
    expect(a.pct).toBe(41);
  });
  it('mọi phòng mẫu đều hợp lệ (không chồng lấn)', () => {
    for (const id of ROOM_IDS) {
      const { l, R } = geoOf(id);
      expect(analysePlan(l, R, registry).bad.size, id).toBe(0);
      for (const w of ['T', 'R', 'B', 'L'] as const) expect(analyseWall(l, R, w).bad.size, `${id}/${w}`).toBe(0);
    }
  });
  it('món đặt chồng lên nhau hoặc ra ngoài phòng hoặc vào vùng mở cửa thì bị đánh dấu', () => {
    const { l, R } = geoOf('ngu');
    const bed = l.items.find((i) => i.id === 'bed2')!;
    const stray = makeFloorItem(registry.get('night')!, bed.x, bed.y, 0, undefined, nextUid());
    const outside = makeFloorItem(registry.get('night')!, 5, 5, 0, undefined, nextUid());
    const inDoor = makeFloorItem(registry.get('arm')!, 70, 310, 0, undefined, nextUid());
    l.items.push(stray, outside, inDoor);
    const a = analysePlan(l, R, registry);
    expect(a.bad.has(stray.uid)).toBe(true);
    expect(a.bad.has(bed.uid)).toBe(true);
    expect(a.bad.has(outside.uid)).toBe(true);
    expect(a.bad.has(inDoor.uid)).toBe(true);
  });
  it('thảm (lớp dưới) không tính chồng lấn', () => {
    const { l, R } = geoOf('khach');
    const rug = l.items.find((i) => i.id === 'rug')!;
    expect(rug.z).toBe(0);
    expect(analysePlan(l, R, registry).bad.has(rug.uid)).toBe(false);
  });
  it('món lạ không có trong thư viện vẫn được tính lối đi', () => {
    const { l, R } = geoOf('ngu');
    const custom = { uid: nextUid(), id: 'u_box', name: 'Hộp lạ', w: 40, d: 40, x: 340, y: 250, rot: 0, color: '#999999', z: 1 as const, h: 80 };
    l.items.push(custom);
    const a = analysePlan(l, R, registry);
    expect(a.bad.has(custom.uid)).toBe(false);
  });
});

describe('phân tích mặt đứng', () => {
  it('món đè lên cửa sổ hoặc vượt trần thì bị đánh dấu', () => {
    const { l, R } = geoOf('khach');
    // tường phải của phòng khách có cửa sổ pos 60 w 180, sill 90, h 120
    l.walls.R.push({ uid: nextUid(), id: 'art', name: 'Tranh', w: 60, h: 80, x: 100, y: 120, color: '#e3b7a0' });
    l.walls.T.push({ uid: nextUid(), id: 'art', name: 'Tranh', w: 60, h: 80, x: 30, y: 250, color: '#e3b7a0' });
    const r = analyseWall(l, R, 'R');
    const t = analyseWall(l, R, 'T');
    expect(r.bad.size).toBe(1);
    expect(t.bad.size).toBe(1);
  });
});

describe('đo khoảng cách tới tường', () => {
  it('mặt bằng: tính trên khung bao của món đã xoay', () => {
    const { R } = geoOf('ngu');
    const g = planGaps(boxOf({ x: 200, y: 115, w: 170, d: 210, rot: 0 }), R);
    expect(g).toEqual({ left: 115, right: 115, top: 10, bottom: 130 });
    const r = planGaps(boxOf({ x: 100, y: 100, w: 100, d: 40, rot: 90 }), R);
    expect(r.left).toBeCloseTo(80);
    expect(r.top).toBeCloseTo(50);
  });
  it('mặt đứng: hai đầu tường, sàn, trần', () => {
    const g = wallGaps({ x0: 40, x1: 100, y0: 120, y1: 200 }, 400, 270);
    expect(g).toEqual({ left: 40, right: 300, floor: 120, ceiling: 70 });
  });
});

describe('thao tác trên bố trí', () => {
  it('khóa món: chỉ cho đổi màu', () => {
    const it = { locked: true } as { locked?: boolean } as never;
    expect(canEdit(it, 'color')).toBe(true);
    for (const op of ['move', 'rotate', 'resize', 'delete'] as const) expect(canEdit(it, op)).toBe(false);
    expect(canEdit(null, 'color')).toBe(false);
  });
  it('removeItem bỏ qua món đã khóa, clearScope giữ món khóa', () => {
    const l = ngu();
    const bed = l.items.find((i) => i.id === 'bed2')!;
    bed.locked = true;
    expect(removeItem(l, { scope: 'floor', uid: bed.uid })).toBe(false);
    const removed = clearScope(l, 'floor');
    expect(removed).toBe(4);
    expect(l.items.map((i) => i.id)).toEqual(['bed2']);
    bed.locked = false;
    expect(removeItem(l, { scope: 'floor', uid: bed.uid })).toBe(true);
    expect(l.items.length).toBe(0);
  });
  it('clearAll xóa cả đồ sàn và đồ tường, trừ món khóa', () => {
    const l = ngu();
    l.walls.L[0]!.locked = true;
    clearAll(l);
    expect(l.items.length).toBe(0);
    expect(l.walls.L.length).toBe(1);
    expect(l.walls.R.length).toBe(0);
  });
  it('duplicateItem lệch 20 cm, bản sao không khóa, mã mới', () => {
    const l = ngu();
    const src = l.items[0]!;
    src.locked = true;
    const sel = duplicateItem(l, { scope: 'floor', uid: src.uid }, nextUid)!;
    const copy = findItem(l, sel) as typeof src;
    expect(copy.uid).not.toBe(src.uid);
    expect(copy.x).toBe(src.x + 20);
    expect(copy.y).toBe(src.y + 20);
    expect(copy.locked).toBeUndefined();
    expect(src.locked).toBe(true);
  });
  it('setRoomDim kẹp trong khoảng cho phép và kéo món vào trong phòng', () => {
    const l = ngu();
    expect(setRoomDim(l, 'W', 99)).toBe(150);
    expect(setRoomDim(l, 'H', 5000)).toBe(1500);
    expect(l.items.every((i) => i.x <= 150)).toBe(true);
    expect(setRoomDim(l, 'ceil', 300.4)).toBe(300);
  });
  it('snapValue theo lưới 5 cm', () => {
    expect(snapValue(12, true)).toBe(10);
    expect(snapValue(13, true)).toBe(15);
    expect(snapValue(12.4, false)).toBe(12);
  });
  it('isUsableLayout và cloneLayout, maxUid', () => {
    const l = ngu();
    expect(isUsableLayout(l)).toBe(true);
    expect(isUsableLayout({})).toBe(false);
    expect(isUsableLayout({ ...l, walls: { T: [] } })).toBe(false);
    const c = cloneLayout(l);
    c.items.pop();
    expect(c.items.length).toBe(l.items.length - 1);
    expect(maxUid({ ngu: l })).toBeGreaterThan(0);
  });
});
