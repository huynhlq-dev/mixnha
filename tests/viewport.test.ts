import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, Viewport } from '../src/views/viewport';

const BASE = { x: -50, y: -50, w: 500, h: 450 };
const make = () => {
  const v = new Viewport();
  v.setBase(BASE);
  v.fit();
  return v;
};

describe('vùng nhìn (phóng to, kéo)', () => {
  it('vừa khung: nhìn đúng toàn bộ bản vẽ', () => {
    const v = make();
    expect(v.view()).toEqual(BASE);
    expect(v.isZoomed).toBe(false);
    expect(v.toString()).toBe('-50 -50 500 450');
  });

  it('phóng to giữ nguyên điểm dưới con trỏ', () => {
    const v = make();
    const p = { x: 300, y: 100 };
    const before = v.view();
    const u = (p.x - before.x) / before.w;
    const t = (p.y - before.y) / before.h;
    v.zoomBy(2, p);
    const after = v.view();
    expect(after.w).toBeCloseTo(BASE.w / 2);
    expect((p.x - after.x) / after.w).toBeCloseTo(u);
    expect((p.y - after.y) / after.h).toBeCloseTo(t);
    expect(v.isZoomed).toBe(true);
  });

  it('phóng to ở sát mép: vùng nhìn bị kẹp lại trong khung, không trượt ra ngoài', () => {
    const v = make();
    v.zoomBy(4, { x: 440, y: 390 });
    const a = v.view();
    expect(a.x + a.w).toBeLessThanOrEqual(BASE.x + BASE.w + 1e-9);
    expect(a.y + a.h).toBeLessThanOrEqual(BASE.y + BASE.h + 1e-9);
    expect(a.x).toBeGreaterThanOrEqual(BASE.x);
  });

  it('giới hạn từ 1 đến 8 lần', () => {
    const v = make();
    v.zoomBy(0.1);
    expect(v.level).toBe(1);
    for (let i = 0; i < 20; i++) v.zoomBy(2);
    expect(v.level).toBe(MAX_ZOOM);
    expect(v.canZoomIn).toBe(false);
  });

  it('kéo bản vẽ dịch vùng nhìn, và dừng ở mép', () => {
    const v = make();
    v.zoomBy(2);
    const c0 = v.view();
    v.panBy(30, -20);
    const c1 = v.view();
    expect(c1.x - c0.x).toBeCloseTo(30);
    expect(c1.y - c0.y).toBeCloseTo(-20);
    v.panBy(1e6, 1e6);
    const e = v.view();
    expect(e.x + e.w).toBeCloseTo(BASE.x + BASE.w);
    expect(e.y + e.h).toBeCloseTo(BASE.y + BASE.h);
  });

  it('không phóng to thì kéo không có tác dụng', () => {
    const v = make();
    v.panBy(100, 100);
    expect(v.view()).toEqual(BASE);
  });

  it('đổi kích thước khung bản vẽ khi đang phóng to: giữ mức phóng, kẹp lại vùng nhìn', () => {
    const v = make();
    v.zoomBy(2);
    v.panBy(1e6, 1e6);
    v.setBase({ x: -50, y: -50, w: 300, h: 250 });
    expect(v.level).toBe(2);
    const a = v.view();
    expect(a.w).toBeCloseTo(150);
    expect(a.x + a.w).toBeLessThanOrEqual(250 + 1e-9);
  });

  it('fit đưa về toàn khung', () => {
    const v = make();
    v.zoomBy(3, { x: 200, y: 200 });
    v.fit();
    expect(v.view()).toEqual(BASE);
  });
});
