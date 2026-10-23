import { describe, expect, it } from 'vitest';
import { keyAction, type KeyContext, type KeyInfo } from '../src/ui/keys';

const key = (k: string, over: Partial<KeyInfo> = {}): KeyInfo => ({ key: k, ctrl: false, meta: false, alt: false, shift: false, typing: false, inDialog: false, handled: false, ...over });
const ctx = (over: Partial<KeyContext> = {}): KeyContext => ({ mode: 'plan', hasSel: false, selFloor: false, selOpening: false, selDoor: false, selRoom: false, ...over });

describe('phím tắt khi đang chọn một phòng trong mô hình căn hộ', () => {
  const room = ctx({ selRoom: true });

  it('Delete và Backspace xóa phòng', () => {
    expect(keyAction(key('Delete'), room)).toEqual({ type: 'remove' });
    expect(keyAction(key('Backspace'), room)).toEqual({ type: 'remove' });
  });

  it('mũi tên dời phòng, R không xoay gì', () => {
    expect(keyAction(key('ArrowLeft'), room)).toEqual({ type: 'nudge', dir: 'left', step: 5 });
    expect(keyAction(key('r'), room)).toBeNull();
  });

  it('không chọn phòng nào thì Delete không làm gì; đang gõ chữ thì phím là của ô nhập', () => {
    expect(keyAction(key('Delete'), ctx())).toBeNull();
    expect(keyAction(key('Delete', { typing: true }), room)).toBeNull();
  });
});

describe('phím tắt khi đang chọn cửa đi hoặc cửa sổ', () => {
  const opening = ctx({ selOpening: true });

  it('mũi tên dịch cửa 5 cm, giữ Shift thì 25 cm', () => {
    expect(keyAction(key('ArrowRight'), opening)).toEqual({ type: 'nudge', dir: 'right', step: 5 });
    expect(keyAction(key('ArrowUp', { shift: true }), opening)).toEqual({ type: 'nudge', dir: 'up', step: 25 });
  });

  it('Delete và Backspace xóa cửa đang chọn (cả cửa đi lẫn cửa sổ)', () => {
    expect(keyAction(key('Delete'), opening)).toEqual({ type: 'remove' });
    expect(keyAction(key('Backspace'), opening)).toEqual({ type: 'remove' });
    expect(keyAction(key('Delete'), ctx({ selOpening: true, selDoor: true }))).toEqual({ type: 'remove' });
    // không chọn gì thì Delete không làm gì
    expect(keyAction(key('Delete'), ctx())).toBeNull();
  });

  it('R xoay hướng mở cánh của cửa đi, Shift+R xoay ngược; cửa sổ không có cánh nên R không làm gì', () => {
    const door = ctx({ selOpening: true, selDoor: true });
    expect(keyAction(key('r'), door)).toEqual({ type: 'rotate', delta: 90 });
    expect(keyAction(key('R', { shift: true }), door)).toEqual({ type: 'rotate', delta: -90 });
    expect(keyAction(key('r'), opening)).toBeNull();
  });

  it('trong 3D mũi tên là để xoay camera; đang gõ trong ô số thì không phải phím tắt', () => {
    expect(keyAction(key('ArrowLeft'), ctx({ selOpening: true, mode: '3d' }))).toBeNull();
    expect(keyAction(key('ArrowLeft', { typing: true }), opening)).toBeNull();
  });

  it('không chọn gì thì mũi tên không làm gì; Hoàn tác vẫn dùng được', () => {
    expect(keyAction(key('ArrowLeft'), ctx())).toBeNull();
    expect(keyAction(key('z', { ctrl: true }), ctx())).toEqual({ type: 'undo' });
  });
});

describe('phím tắt khi đang chọn món (giữ nguyên như trước)', () => {
  it('Delete xóa, R xoay đồ sàn, mũi tên dịch', () => {
    expect(keyAction(key('Delete'), ctx({ hasSel: true }))).toEqual({ type: 'remove' });
    expect(keyAction(key('r'), ctx({ hasSel: true, selFloor: true }))).toEqual({ type: 'rotate', delta: 90 });
    expect(keyAction(key('R', { shift: true }), ctx({ hasSel: true, selFloor: true }))).toEqual({ type: 'rotate', delta: -90 });
    expect(keyAction(key('r'), ctx({ hasSel: true }))).toBeNull();
    expect(keyAction(key('ArrowDown'), ctx({ hasSel: true }))).toEqual({ type: 'nudge', dir: 'down', step: 5 });
  });
});
