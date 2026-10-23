import { afterEach, describe, expect, it, vi } from 'vitest';
import { Fullscreen } from '../src/ui/fullscreen';

const make = () => {
  const btn = document.createElement('button');
  btn.setAttribute('aria-pressed', 'false');
  const label = document.createElement('span');
  label.textContent = 'Toàn màn hình';
  const body = document.createElement('body');
  const fs = new Fullscreen(btn, label, body);
  return { fs, btn, label, body };
};

afterEach(() => {
  document.documentElement.style.overflow = '';
  vi.restoreAllMocks();
});

describe('toàn màn hình của khung soạn thảo', () => {
  it('bật: đặt lớp fs trên body, nút thành "đang bật", chữ đổi, trang không cuộn', () => {
    const { fs, btn, label, body } = make();
    expect(fs.on).toBe(false);
    fs.set(true);
    expect(fs.on).toBe(true);
    expect(body.classList.contains('fs')).toBe(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(label.textContent).toBe('Thoát toàn màn hình');
    expect(document.documentElement.style.overflow).toBe('hidden');
  });

  it('tắt: trả mọi thứ về như cũ', () => {
    const { fs, btn, label, body } = make();
    fs.set(true);
    fs.set(false);
    expect(fs.on).toBe(false);
    expect(body.classList.contains('fs')).toBe(false);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(label.textContent).toBe('Toàn màn hình');
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('toggle đổi qua lại; set cùng trạng thái thì không làm gì', () => {
    const { fs } = make();
    const spy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    fs.toggle();
    expect(fs.on).toBe(true);
    fs.set(true);
    fs.toggle();
    expect(fs.on).toBe(false);
    // chỉ trả lại chỗ cuộn khi thật sự thoát một lần
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('nhớ chỗ đang cuộn lúc bật và trả lại khi thoát', () => {
    const { fs } = make();
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(240);
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    fs.set(true);
    fs.set(false);
    expect(scroll).toHaveBeenCalledWith(0, 240);
  });

  it('xin toàn màn hình thật trên cả trang; bị từ chối thì vẫn phủ kín bằng CSS', async () => {
    const { fs } = make();
    const request = vi.fn(() => Promise.reject(new Error('không cho')));
    Object.defineProperty(document.documentElement, 'requestFullscreen', { value: request, configurable: true });
    fs.set(true);
    await Promise.resolve();
    expect(request).toHaveBeenCalledOnce();
    expect(fs.on).toBe(true);
    delete (document.documentElement as { requestFullscreen?: unknown }).requestFullscreen;
  });

  it('trình duyệt tự thoát toàn màn hình (Esc) thì đồng bộ lại', () => {
    const { fs, body } = make();
    fs.set(true);
    // fullscreenElement không có: trình duyệt đã thoát
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(fs.on).toBe(false);
    expect(body.classList.contains('fs')).toBe(false);
  });

  it('gỡ bộ nghe khi dispose', () => {
    const { fs } = make();
    fs.dispose();
    fs.set(true);
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(fs.on).toBe(true);
    fs.set(false);
  });
});
