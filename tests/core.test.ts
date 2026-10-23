import { describe, expect, it } from 'vitest';
import { ROOMS, ROOM_IDS } from '../src/data/rooms';
import type { ItemDef } from '../src/data/schema';
import type { DoorItem } from '../src/core/types';
import { analysePlan, analyseWall, openingKey, overlappingOpenings } from '../src/core/analyse';
import { alongWall, boxOf, doorGeom, nearestWall, normDeg, openRange, polyOf, posFromRange, satHit, snapAngle, wallLength } from '../src/core/geometry';
import { assignUids, canEdit, clearAll, clearScope, cloneLayout, duplicateItem, findItem, findOpening, freshLayout, isUsableLayout, makeFloorItem, maxUid, removeItem, setRoomDim, snapValue } from '../src/core/layout';
import { planGaps, wallGaps } from '../src/core/measure';
import { addOpening, doorTurn, flipDoorHinge, isOpeningsFull, moveOpening, openingCount, openingRanges, openingSpot, openingStep, removeOpening, resetTo, rotateDoor, setDoorSide, setOpeningWidth, toggleDoorSwing } from '../src/core/ops';
import { createRegistry, registry } from '../src/core/registry';
import { fitOpening, openingsOn, roomGeo } from '../src/core/room';
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

describe('cửa đi và cửa sổ', () => {
  const strip = <T extends { uid: number }>(list: T[]) => list.map(({ uid: _uid, ...rest }) => rest);

  it('bố trí mẫu mang cửa của phòng, mỗi cái một uid riêng', () => {
    for (const id of ROOM_IDS) {
      const l = freshLayout(ROOMS[id], registry, nextUid);
      expect(strip(l.doors)).toEqual(ROOMS[id].doors);
      expect(strip(l.windows)).toEqual(ROOMS[id].windows);
      const uids = [...l.doors, ...l.windows].map((o) => o.uid);
      expect(new Set(uids).size).toBe(uids.length);
    }
  });

  it('roomGeo lấy cửa từ bản vẽ: dời cửa thì hình học đổi theo', () => {
    const l = ngu();
    l.doors[0]!.wall = 'L';
    l.doors[0]!.pos = 100;
    const R = roomGeo(ROOMS.ngu, l);
    expect(R.doors[0]).toMatchObject({ wall: 'L', pos: 100, w: 80 });
    expect(openingsOn(R, 'L')).toEqual([{ kind: 'door', uid: l.doors[0]!.uid, x0: 350 - 100 - 80, x1: 350 - 100, y0: 0, y1: 205, handle: 'left' }]);
    expect(openingsOn(R, 'B')).toEqual([]);
  });

  it('fitOpening: chừa 5 cm mép, rộng từ 30 tới chiều dài tường trừ 10', () => {
    expect(fitOpening({ wall: 'B', pos: -20, w: 80 }, 400, 350)).toEqual({ wall: 'B', pos: 5, w: 80 });
    expect(fitOpening({ wall: 'B', pos: 380, w: 80 }, 400, 350)).toEqual({ wall: 'B', pos: 315, w: 80 });
    expect(fitOpening({ wall: 'L', pos: 0, w: 999 }, 400, 350)).toEqual({ wall: 'L', pos: 5, w: 340 });
    expect(fitOpening({ wall: 'T', pos: 10, w: 5 }, 400, 350).w).toBe(30);
  });

  it('moveOpening: bám lưới 5 cm, kẹp vào tường, đổi tường, báo có đổi hay không', () => {
    const l = ngu();
    const door = l.doors[0]!; // tường dưới, pos 30, rộng 80
    expect(moveOpening(l, door, 'B', 133, true)).toBe(true);
    expect(door.pos).toBe(135);
    expect(moveOpening(l, door, 'B', 133, true)).toBe(false);
    moveOpening(l, door, 'B', 133, false);
    expect(door.pos).toBe(133);
    moveOpening(l, door, 'B', -50, true);
    expect(door.pos).toBe(5);
    moveOpening(l, door, 'B', 9999, true);
    expect(door.pos).toBe(315);
    // sang tường trái (dài 350): kẹp theo chiều dài tường mới
    expect(moveOpening(l, door, 'L', 9999, true)).toBe(true);
    expect(door).toMatchObject({ wall: 'L', pos: 265, w: 80 });
  });

  it('setOpeningWidth: rộng ra mà tràn tường thì dịch cả cửa vào; hẹp nhất 30', () => {
    const l = ngu();
    const win = l.windows[0]!; // tường trên, pos 110, rộng 180
    expect(setOpeningWidth(l, win, 300)).toBe(true);
    expect(win).toMatchObject({ pos: 95, w: 300 });
    expect(setOpeningWidth(l, win, 300)).toBe(false);
    setOpeningWidth(l, win, 20);
    expect(win.w).toBe(30);
    setOpeningWidth(l, win, 99999);
    expect(win).toMatchObject({ pos: 5, w: 390 });
  });

  it('openingRanges theo tường hiện tại của cửa', () => {
    const l = ngu();
    expect(openingRanges(l, l.doors[0]!)).toEqual({ pos: { min: 5, max: 315 }, w: { min: 30, max: 390 } });
    l.doors[0]!.wall = 'L';
    expect(openingRanges(l, l.doors[0]!)).toEqual({ pos: { min: 5, max: 265 }, w: { min: 30, max: 340 } });
  });

  it('openingStep: mặt bằng chỉ dịch theo chiều chạy của tường, mặt đứng đảo chiều ở tường dưới và trái', () => {
    expect(openingStep('plan', 'T', 'right', 5)).toBe(5);
    expect(openingStep('plan', 'B', 'left', 25)).toBe(-25);
    expect(openingStep('plan', 'T', 'down', 5)).toBe(0);
    expect(openingStep('plan', 'L', 'down', 5)).toBe(5);
    expect(openingStep('plan', 'R', 'up', 25)).toBe(-25);
    expect(openingStep('plan', 'R', 'left', 5)).toBe(0);
    expect(openingStep('elev', 'T', 'right', 5)).toBe(5);
    expect(openingStep('elev', 'R', 'left', 5)).toBe(-5);
    expect(openingStep('elev', 'B', 'right', 5)).toBe(-5);
    expect(openingStep('elev', 'L', 'left', 5)).toBe(5);
    expect(openingStep('elev', 'T', 'up', 5)).toBe(0);
  });

  it('posFromRange là ngược của openRange ở cả bốn tường', () => {
    const R = { W: 400, H: 350 };
    for (const wall of ['T', 'R', 'B', 'L'] as const) {
      for (const pos of [5, 30, 117, 200]) {
        const [s0, s1] = openRange(R, { wall, pos, w: 60 });
        expect(s1 - s0).toBe(60);
        expect(posFromRange(R, wall, 60, s0)).toBe(pos);
      }
    }
  });

  it('nearestWall chọn tường gần nhất và ưu tiên tường đang dùng trong khoảng 20 cm', () => {
    const R = { W: 400, H: 350 };
    expect(nearestWall(R, { x: 200, y: 10 })).toBe('T');
    expect(nearestWall(R, { x: 390, y: 175 })).toBe('R');
    expect(nearestWall(R, { x: 200, y: 345 })).toBe('B');
    expect(nearestWall(R, { x: 5, y: 100 })).toBe('L');
    // giữa phòng: tường dưới gần hơn tường trên 10 cm
    expect(nearestWall(R, { x: 200, y: 180 })).toBe('B');
    expect(nearestWall(R, { x: 200, y: 180 }, 'T')).toBe('T');
    expect(nearestWall(R, { x: 200, y: 180 }, 'L')).toBe('B');
    expect(alongWall('T', { x: 7, y: 9 })).toBe(7);
    expect(alongWall('R', { x: 7, y: 9 })).toBe(9);
  });

  it('thu nhỏ phòng thì cửa được kéo vào gọn trong tường mới', () => {
    const l = ngu();
    setRoomDim(l, 'W', 200);
    expect(l.windows[0]).toMatchObject({ wall: 'T', pos: 15, w: 180 });
    expect(l.doors[0]).toMatchObject({ wall: 'B', pos: 30, w: 80 });
  });

  it('cửa đi và cửa sổ chồng lên nhau trên một tường thì bị đánh dấu', () => {
    const l = ngu();
    expect(overlappingOpenings(roomGeo(ROOMS.ngu, l)).size).toBe(0);
    for (const id of ROOM_IDS) expect(overlappingOpenings(roomGeo(ROOMS[id], freshLayout(ROOMS[id], registry, nextUid))).size).toBe(0);
    moveOpening(l, l.doors[0]!, 'T', 150, true);
    const bad = overlappingOpenings(roomGeo(ROOMS.ngu, l));
    expect([...bad].sort()).toEqual([openingKey({ kind: 'door', uid: l.doors[0]!.uid }), openingKey({ kind: 'win', uid: l.windows[0]!.uid })].sort());
  });

  it('vùng mở cánh cửa theo cửa đã dời: đồ nằm trong vùng đó bị báo chắn cửa', () => {
    const l = ngu();
    const dress = l.items.find((i) => i.id === 'dress')!;
    expect(analysePlan(l, roomGeo(ROOMS.ngu, l), registry).bad.has(dress.uid)).toBe(false);
    moveOpening(l, l.doors[0]!, 'R', 120, true); // cánh mở vào phòng ở chỗ tủ đứng
    expect(analysePlan(l, roomGeo(ROOMS.ngu, l), registry).bad.has(dress.uid)).toBe(true);
  });

  it('đồ gắn tường chạm cửa sổ ở chỗ mới thì bị báo', () => {
    const l = ngu();
    const mirror = l.walls.R[0]!; // gương tường phải, x 150, cao 110 đến 190 cm
    expect(analyseWall(l, roomGeo(ROOMS.ngu, l), 'R').bad.has(mirror.uid)).toBe(false);
    moveOpening(l, l.windows[0]!, 'R', 110, true); // cửa sổ cao 90 đến 210 cm, dọc tường từ 110 đến 290
    expect(analyseWall(l, roomGeo(ROOMS.ngu, l), 'R').bad.has(mirror.uid)).toBe(true);
    // máy lạnh tường trái ở cao 220 cm, trên đầu cửa sổ: không vướng
    moveOpening(l, l.windows[0]!, 'L', 100, true);
    expect(analyseWall(l, roomGeo(ROOMS.ngu, l), 'L').bad.has(l.walls.L[0]!.uid)).toBe(false);
  });

  it('Bố trí mẫu (mặt bằng, cả phòng) đưa cửa về chỗ cũ; mẫu một tường thì giữ nguyên cửa', () => {
    const l = ngu();
    moveOpening(l, l.doors[0]!, 'R', 200, true);
    resetTo(l, ngu(), 'T');
    expect(l.doors[0]).toMatchObject({ wall: 'R', pos: 200 });
    resetTo(l, ngu(), 'plan');
    expect(l.doors[0]).toMatchObject({ wall: 'B', pos: 30 });
    moveOpening(l, l.windows[0]!, 'B', 50, true);
    resetTo(l, ngu(), 'all');
    expect(l.windows[0]).toMatchObject({ wall: 'T', pos: 110 });
  });

  it('findOpening, maxUid và assignUids tính cả cửa', () => {
    const l = ngu();
    expect(findOpening(l, { kind: 'door', uid: l.doors[0]!.uid })).toBe(l.doors[0]);
    expect(findOpening(l, { kind: 'win', uid: l.doors[0]!.uid })).toBeUndefined();
    expect(findOpening(l, null)).toBeUndefined();
    l.windows[0]!.uid = 9999;
    expect(maxUid({ ngu: l })).toBe(9999);
    let n = 50_000;
    assignUids(l, () => ++n);
    expect(l.doors[0]!.uid).toBeGreaterThan(50_000);
    expect(l.windows[0]!.uid).toBeGreaterThan(50_000);
    expect(l.doors[0]!.uid).not.toBe(l.windows[0]!.uid);
  });
});

describe('hướng mở cánh cửa đi', () => {
  const R = { W: 400, H: 350 };
  const geo = (d: Parameters<typeof doorGeom>[1]) => {
    const g = doorGeom(R, d);
    return { s: g.s, e: g.e, t: g.t, sweep: g.sweep, zone: g.zone };
  };

  it('mặc định (bản lề gần góc, mở vào) giữ đúng hình cũ ở cả bốn tường', () => {
    expect(geo({ wall: 'B', pos: 30, w: 80 })).toEqual({ s: [30, 350], e: [110, 350], t: [30, 270], sweep: 0, zone: { x0: 30, x1: 110, y0: 270, y1: 350 } });
    expect(geo({ wall: 'T', pos: 30, w: 80 })).toEqual({ s: [30, 0], e: [110, 0], t: [30, 80], sweep: 1, zone: { x0: 30, x1: 110, y0: 0, y1: 80 } });
    expect(geo({ wall: 'L', pos: 100, w: 60 })).toEqual({ s: [0, 100], e: [0, 160], t: [60, 100], sweep: 0, zone: { x0: 0, x1: 60, y0: 100, y1: 160 } });
    expect(geo({ wall: 'R', pos: 100, w: 60 })).toEqual({ s: [400, 100], e: [400, 160], t: [340, 100], sweep: 1, zone: { x0: 340, x1: 400, y0: 100, y1: 160 } });
  });

  it('bản lề ở đầu xa: bản lề, đầu tự do và chiều quét đổi chỗ, vùng quét giữ nguyên', () => {
    expect(geo({ wall: 'B', pos: 30, w: 80, hinge: 'end' })).toEqual({ s: [110, 350], e: [30, 350], t: [110, 270], sweep: 1, zone: { x0: 30, x1: 110, y0: 270, y1: 350 } });
    expect(geo({ wall: 'L', pos: 100, w: 60, hinge: 'end' })).toEqual({ s: [0, 160], e: [0, 100], t: [60, 160], sweep: 1, zone: { x0: 0, x1: 60, y0: 100, y1: 160 } });
  });

  it('mở ra ngoài: cánh xoay quanh mặt ngoài tường, vùng quét nằm ngoài phòng', () => {
    expect(geo({ wall: 'B', pos: 30, w: 80, swing: 'out' })).toEqual({ s: [30, 360], e: [110, 360], t: [30, 440], sweep: 1, zone: { x0: 30, x1: 110, y0: 360, y1: 440 } });
    expect(geo({ wall: 'B', pos: 30, w: 80, hinge: 'end', swing: 'out' })).toEqual({ s: [110, 360], e: [30, 360], t: [110, 440], sweep: 0, zone: { x0: 30, x1: 110, y0: 360, y1: 440 } });
    expect(geo({ wall: 'T', pos: 30, w: 80, hinge: 'end', swing: 'out' })).toEqual({ s: [110, -10], e: [30, -10], t: [110, -90], sweep: 1, zone: { x0: 30, x1: 110, y0: -90, y1: -10 } });
    expect(geo({ wall: 'R', pos: 100, w: 60, swing: 'out' })).toEqual({ s: [410, 100], e: [410, 160], t: [470, 100], sweep: 0, zone: { x0: 410, x1: 470, y0: 100, y1: 160 } });
  });

  it('đổi bên bản lề và mở vào/ra: giá trị mặc định không được ghi vào cửa', () => {
    const l = ngu();
    const door = l.doors[0]!;
    expect(doorTurn(door)).toBe(0);
    flipDoorHinge(door);
    expect(door.hinge).toBe('end');
    expect('swing' in door).toBe(false);
    toggleDoorSwing(door);
    expect(door).toMatchObject({ hinge: 'end', swing: 'out' });
    flipDoorHinge(door);
    expect('hinge' in door).toBe(false);
    expect(door.swing).toBe('out');
    toggleDoorSwing(door);
    expect('swing' in door).toBe(false);
    expect(Object.keys(door).sort()).toEqual(['pos', 'uid', 'w', 'wall']);
    setDoorSide(door, 'end', 'out');
    expect(doorTurn(door)).toBe(2);
  });

  it('rotateDoor: bốn nấc quay về chỗ cũ, mỗi nấc đúng một góc phần tư quanh ô cửa theo chiều kim đồng hồ', () => {
    for (const wall of ['T', 'R', 'B', 'L'] as const) {
      const door: DoorItem = { uid: 1, wall, pos: 100, w: 60 };
      const centre = (): [number, number] => {
        const g = doorGeom(R, door);
        // vectơ từ giữa chỗ hở trên tường tới đầu cánh khi mở 90°: nằm ở một trong bốn góc quanh ô cửa
        return [g.t[0] - (g.gap.x + g.gap.w / 2), g.t[1] - (g.gap.y + g.gap.h / 2)];
      };
      const seen = new Set<string>();
      let prev = centre();
      for (let i = 0; i < 4; i++) {
        seen.add(`${door.hinge ?? 'start'}-${door.swing ?? 'in'}`);
        rotateDoor(door, true);
        const next = centre();
        // y hướng xuống: tích có hướng dương nghĩa là quay theo chiều kim đồng hồ trên màn hình
        expect(prev[0] * next[1] - prev[1] * next[0]).toBeGreaterThan(0);
        prev = next;
      }
      expect(seen.size).toBe(4);
      expect(doorTurn(door)).toBe(0);
      rotateDoor(door, false);
      rotateDoor(door, true);
      expect(doorTurn(door)).toBe(0);
    }
  });

  it('cửa mở ra ngoài không chắn đồ trong phòng; mở vào ở chỗ có tủ thì chắn', () => {
    const l = ngu();
    const dress = l.items.find((i) => i.id === 'dress')!;
    moveOpening(l, l.doors[0]!, 'R', 120, true);
    expect(analysePlan(l, roomGeo(ROOMS.ngu, l), registry).bad.has(dress.uid)).toBe(true);
    toggleDoorSwing(l.doors[0]!);
    expect(analysePlan(l, roomGeo(ROOMS.ngu, l), registry).bad.has(dress.uid)).toBe(false);
  });

  it('openingsOn: tay nắm ở phía đối diện bản lề, nhìn từ trong phòng', () => {
    const l = ngu();
    const door = l.doors[0]!; // tường dưới: đầu gần góc (pos) nằm bên phải khi nhìn từ trong phòng
    const handle = (): string | undefined => openingsOn(roomGeo(ROOMS.ngu, l), 'B')[0]!.handle;
    expect(handle()).toBe('left');
    flipDoorHinge(door);
    expect(handle()).toBe('right');
    moveOpening(l, door, 'T', 300, true); // tường trên: đầu gần góc nằm bên trái
    expect(openingsOn(roomGeo(ROOMS.ngu, l), 'T').find((o) => o.kind === 'door')!.handle).toBe('left');
    flipDoorHinge(door);
    expect(openingsOn(roomGeo(ROOMS.ngu, l), 'T').find((o) => o.kind === 'door')!.handle).toBe('right');
    expect(openingsOn(roomGeo(ROOMS.ngu, l), 'T').find((o) => o.kind === 'win')!.handle).toBeUndefined();
  });
});

describe('thêm và xóa cửa đi, cửa sổ', () => {
  const preset = (id: string) => registry.opening(id)!;

  it('registry tra được từng loại cửa; mã món thường không phải mã cửa', () => {
    expect(registry.opening('door80')).toMatchObject({ kind: 'door', w: 80 });
    expect(registry.opening('win180')).toMatchObject({ kind: 'win', w: 180, sill: 90, h: 120 });
    expect(registry.opening('bed2')).toBeUndefined();
    expect(registry.get('door80')).toBeUndefined();
    expect(createRegistry([], CATEGORIES).openings).toEqual([]);
  });

  it('addOpening: cửa đi nằm đúng chỗ, bám lưới, kẹp vào tường', () => {
    const l = ngu();
    const sel = addOpening(l, preset('door90'), 'L', 133, true, 900);
    expect(sel).toEqual({ kind: 'door', uid: 900 });
    expect(l.doors.at(-1)).toEqual({ uid: 900, wall: 'L', pos: 135, w: 90 });
    addOpening(l, preset('door90'), 'L', -40, true, 901);
    expect(l.doors.at(-1)).toMatchObject({ pos: 5 });
    addOpening(l, preset('door90'), 'L', 9999, false, 902);
    expect(l.doors.at(-1)).toMatchObject({ pos: 350 - 90 - 5 });
  });

  it('addOpening: cửa sổ mang bậu và chiều cao của loại đó, kẹp theo trần', () => {
    const l = ngu();
    addOpening(l, preset('win60'), 'R', 100, true, 910);
    expect(l.windows.at(-1)).toEqual({ uid: 910, wall: 'R', pos: 100, w: 60, sill: 110, h: 60 });
    addOpening(l, preset('win200'), 'T', 100, true, 911);
    expect(l.windows.at(-1)).toMatchObject({ w: 200, sill: 0, h: 210 });
    l.ceil = 220;
    addOpening(l, preset('win180'), 'T', 100, true, 912);
    expect(l.windows.at(-1)).toMatchObject({ sill: 90, h: 120 });
    l.ceil = 230;
    addOpening(l, preset('win200'), 'T', 100, true, 913);
    expect(l.windows.at(-1)).toMatchObject({ sill: 0, h: 210 });
    addOpening(l, { ...preset('win120'), sill: 200, h: 120 }, 'T', 100, true, 914);
    expect(l.windows.at(-1)!.sill! + l.windows.at(-1)!.h!).toBeLessThanOrEqual(230);
  });

  it('openingSpot theo điểm thả: mặt bằng lấy tường gần nhất, tâm cửa ở điểm thả; tường lấy theo hệ tọa độ mặt đứng', () => {
    const l = ngu(); // 400 x 350
    expect(openingSpot(l, 80, { kind: 'plan', x: 200, y: 10 })).toEqual({ wall: 'T', pos: 160 });
    expect(openingSpot(l, 80, { kind: 'plan', x: 5, y: 100 })).toEqual({ wall: 'L', pos: 60 });
    expect(openingSpot(l, 80, { kind: 'plan', x: 395, y: 300 })).toEqual({ wall: 'R', pos: 260 });
    // tường dưới trên mặt đứng: tâm cửa tại s = 100 nghĩa là mép trái ở 60, tức pos = 400 - 80 - 60
    expect(openingSpot(l, 80, { kind: 'wall', wall: 'B', s: 100 })).toEqual({ wall: 'B', pos: 260 });
    expect(openingSpot(l, 80, { kind: 'wall', wall: 'T', s: 100 })).toEqual({ wall: 'T', pos: 60 });
  });

  it('openingSpot tự tìm chỗ: ưu tiên tường được nhắc nếu còn đủ chỗ, đặt giữa khoảng trống', () => {
    const l = ngu(); // tường dưới có cửa đi 30-110; tường trên có cửa sổ 110-290
    // tường dưới còn khoảng trống 110-395 (285 cm): đặt giữa
    expect(openingSpot(l, 80, null, 'B')).toEqual({ wall: 'B', pos: (110 + 395 - 80) / 2 });
    // tường trái trống hẳn
    expect(openingSpot(l, 80, null, 'L')).toEqual({ wall: 'L', pos: (5 + 345 - 80) / 2 });
  });

  it('openingSpot không có tường ưu tiên thì chọn khoảng trống dài nhất; hết chỗ thì đặt giữa tường ưu tiên', () => {
    const l = ngu();
    // tường phải và tường trái đều trống: tường trên T là 400 dài nhưng có cửa sổ; dài nhất là tường trái/phải (340) hay trên dưới còn 285/105
    const spot = openingSpot(l, 80, null);
    expect(['R', 'L']).toContain(spot.wall);
    expect(spot.pos).toBe((5 + 345 - 80) / 2);
    // hết chỗ ở mọi tường: choán đầy
    for (const wall of ['T', 'R', 'B', 'L'] as const) addOpening(l, { ...preset('win180'), w: 300 }, wall, 20, true, 920 + wall.charCodeAt(0));
    const full = openingSpot(l, 200, null, 'R');
    expect(full.wall).toBe('R');
    expect(full.pos).toBe((350 - 200) / 2);
    expect(openingSpot(l, 200, null).wall).toBe('T');
  });

  it('openingSpot né các cửa đã có: hai lần liên tiếp không đè nhau', () => {
    const l = ngu();
    let uidn = 1000;
    for (let i = 0; i < 4; i++) {
      const s = openingSpot(l, 80, null, 'L');
      addOpening(l, preset('door80'), s.wall, s.pos, true, uidn++);
    }
    expect(overlappingOpenings(roomGeo(ROOMS.ngu, l)).size).toBe(0);
  });

  it('mỗi phòng tối đa 12 cửa đi và 12 cửa sổ; đếm đúng theo loại', () => {
    const l = ngu();
    expect(openingCount(l, 'door')).toBe(1);
    expect(openingCount(l, 'win')).toBe(1);
    expect(isOpeningsFull(l, 'door')).toBe(false);
    for (let i = 0; i < 11; i++) addOpening(l, preset('door70'), 'L', 20 + i, true, 2000 + i);
    expect(openingCount(l, 'door')).toBe(12);
    expect(isOpeningsFull(l, 'door')).toBe(true);
    expect(isOpeningsFull(l, 'win')).toBe(false);
  });

  it('removeOpening xóa đúng cửa, báo false nếu không có', () => {
    const l = ngu();
    const sel = addOpening(l, preset('door80'), 'R', 100, true, 3000);
    expect(l.doors).toHaveLength(2);
    expect(removeOpening(l, sel)).toBe(true);
    expect(l.doors).toHaveLength(1);
    expect(removeOpening(l, sel)).toBe(false);
    expect(removeOpening(l, { kind: 'win', uid: 3000 })).toBe(false);
    expect(removeOpening(l, { kind: 'win', uid: l.windows[0]!.uid })).toBe(true);
    expect(l.windows).toHaveLength(0);
    expect(findOpening(l, { kind: 'win', uid: 3000 })).toBeUndefined();
  });
});
