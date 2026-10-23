import { describe, expect, it } from 'vitest';
import { freshLayout } from '../src/core/layout';
import { registry } from '../src/core/registry';
import { ROOMS } from '../src/data/rooms';
import { colorAt, MAX_RECENT, paintAt, penHint, penShown, rememberColor } from '../src/ui/pen';

describe('khối Bút màu chỉ hiện khi cần', () => {
  it('có món đang chọn thì hiện; không chọn gì và không dùng bút thì ẩn', () => {
    expect(penShown(true, null)).toBe(true);
    expect(penShown(false, null)).toBe(false);
  });

  it('đang dùng bút thì vẫn hiện dù bỏ chọn món, để còn nút tắt bút', () => {
    expect(penShown(false, 'pick')).toBe(true);
    expect(penShown(false, 'paint')).toBe(true);
    expect(penShown(true, 'paint')).toBe(true);
  });
});

describe('bút màu', () => {
  it('rememberColor đưa màu lên đầu, bỏ trùng, giữ tối đa 8 màu', () => {
    expect(rememberColor(['#111111', '#222222'], '#222222')).toEqual(['#222222', '#111111']);
    const many = Array.from({ length: 12 }, (_, i) => `#${String(i).padStart(6, '0')}`);
    const out = rememberColor(many, '#abcdef');
    expect(out).toHaveLength(MAX_RECENT);
    expect(out[0]).toBe('#abcdef');
  });

  it('penHint đổi theo công cụ', () => {
    expect(penHint('pick')).toContain('hút màu');
    expect(penHint('paint')).toContain('Esc');
    expect(penHint(null)).toContain('Lấy màu');
  });

  it('colorAt và paintAt làm việc với sàn, tường và món; món không còn thì báo không có', () => {
    const l = freshLayout(ROOMS.ngu, registry, (() => { let n = 0; return () => ++n; })());
    const bed = l.items[0]!;
    expect(colorAt(l, { kind: 'floor' })).toBe(l.floor);
    expect(colorAt(l, { kind: 'wall' })).toBe(l.wall);
    expect(colorAt(l, { kind: 'item', sel: { scope: 'floor', uid: bed.uid } })).toBe(bed.color);
    expect(colorAt(l, { kind: 'item', sel: { scope: 'floor', uid: 9999 } })).toBeNull();
    expect(paintAt(l, { kind: 'floor' }, '#111111')).toBe(true);
    expect(l.floor).toBe('#111111');
    // món đã khóa vẫn đổi màu được
    bed.locked = true;
    expect(paintAt(l, { kind: 'item', sel: { scope: 'floor', uid: bed.uid } }, '#222222')).toBe(true);
    expect(bed.color).toBe('#222222');
    expect(paintAt(l, { kind: 'item', sel: { scope: 'floor', uid: 9999 } }, '#333333')).toBe(false);
  });
});
