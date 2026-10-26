import { Box3, Color, Group, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { freshLayout } from '../src/core/layout';
import { registry } from '../src/core/registry';
import { roomGeo } from '../src/core/room';
import { ROOMS } from '../src/data/rooms';
import { SHAPE_IDS } from '../src/data/shapes';
import type { Host } from '../src/views/host';
import { describe3D } from '../src/views/info3d';
import { Scene3D, wallPieces } from '../src/views/scene3d';
import { SHAPES, shapeFor } from '../src/views/shapes';

describe('kiểu vẽ 3D của món', () => {
  it('mọi kiểu khai báo trong data đều có hàm dựng', () => {
    for (const id of SHAPE_IDS) expect(typeof SHAPES[id]).toBe('function');
    expect(Object.keys(SHAPES).sort()).toEqual([...SHAPE_IDS].sort());
  });

  it('kiểu lạ hoặc không ghi thì dùng hình hộp', () => {
    expect(shapeFor(undefined)).toBe(SHAPES.box);
    expect(shapeFor('khongco')).toBe(SHAPES.box);
    expect(shapeFor('toString')).toBe(SHAPES.box);
    expect(shapeFor('hasOwnProperty')).toBe(SHAPES.box);
    expect(shapeFor('bed')).toBe(SHAPES.bed);
  });

  it('mỗi món trong thư viện dựng ra khối nằm trong phạm vi rộng × sâu của nó', () => {
    for (const def of registry.live('floor')) {
      const g = new Group();
      shapeFor(def.shape)({ g, w: def.w, d: def.d, h: def.h, color: new Color(def.color) });
      expect(g.children.length, def.id).toBeGreaterThan(0);
      const size = new Box3().setFromObject(g).getSize(new Vector3());
      expect(size.x, `${def.id} rộng`).toBeLessThanOrEqual(def.w + 2.01);
      expect(size.z, `${def.id} sâu`).toBeLessThanOrEqual(def.d + 2.01);
      expect(size.x, `${def.id} rộng`).toBeGreaterThan(def.w * 0.5);
      expect(size.y, `${def.id} cao`).toBeGreaterThan(0);
    }
  });

  it('hình hộp cao đúng chiều cao khai báo, nằm trên sàn', () => {
    const g = new Group();
    SHAPES.box({ g, w: 100, d: 50, h: 40, color: new Color('#ffffff') });
    const b = new Box3().setFromObject(g);
    expect(b.min.y).toBeCloseTo(0);
    expect(b.max.y).toBeCloseTo(40);
  });
});

describe('tường 3D quanh cửa', () => {
  const R = roomGeo(ROOMS.ngu, freshLayout(ROOMS.ngu, registry, () => 1));

  it('tường có cửa đi: chừa lỗ từ sàn tới 205 cm, phần trên cửa vẫn là tường', () => {
    const p = wallPieces(R, 'B');
    expect(p.rects).toEqual([
      [0, 290, 0, 270],
      [290, 370, 205, 270],
      [370, 400, 0, 270],
    ]);
    expect(p.glass).toEqual([]);
  });

  it('tường có cửa sổ: tường dưới, tường trên và một tấm kính ở giữa', () => {
    const p = wallPieces(R, 'T');
    expect(p.rects).toEqual([
      [0, 110, 0, 270],
      [110, 290, 0, 90],
      [110, 290, 210, 270],
      [290, 400, 0, 270],
    ]);
    expect(p.glass).toEqual([[110, 290, 90, 210]]);
  });

  it('tường đặc trọn một mảnh', () => {
    expect(wallPieces(R, 'L').rects).toEqual([[0, 350, 0, 270]]);
  });
});

describe('cảnh 3D khi trình duyệt không có WebGL', () => {
  const layout = freshLayout(ROOMS.ngu, registry, () => 1);
  const R = roomGeo(ROOMS.ngu, layout);
  const host = {
    registry,
    layout: () => layout,
    geo: () => R,
    view: () => ({ mode: '3d', wall: 'T', sel: null, dim: true, snap: true, pen: null }),
  } as unknown as Host;

  it('báo lỗi bằng lời thay vì ném lỗi, và không làm hỏng các kiểu xem khác', () => {
    const box = document.createElement('div');
    document.body.append(box);
    const scene = new Scene3D(box, host);
    expect(() => scene.show()).not.toThrow();
    expect(scene.failed).toBe(true);
    expect(box.querySelector('.v3msg')?.textContent).toContain('WebGL');
    expect(() => scene.invalidate()).not.toThrow();
    expect(() => scene.dispose()).not.toThrow();
  });

  it('dòng trạng thái 3D', () => {
    expect(describe3D(layout, R, registry, true).status.text).toContain('Chưa dựng được 3D');
    const ok = describe3D(layout, R, registry, false);
    expect(ok.title).toBe('Phòng ngủ · 3D');
    expect(ok.size).toBe('400 × 350 × 270 cm');
    expect(ok.status.tone).toBe('info');
    layout.items[0]!.x = 0;
    layout.items[0]!.y = 0;
    const bad = describe3D(layout, R, registry, false);
    expect(bad.status.tone).toBe('bad');
    expect(bad.status.text).toContain('khung cam');
  });
});
