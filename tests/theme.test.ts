import { describe, expect, it, vi } from 'vitest';
import { memoryKV } from '../src/storage/kv';
import { bindThemeToggle, parseTheme, THEME_KEY } from '../src/ui/theme';

function setup(saved?: string) {
  const root = document.createElement('html');
  const btn = document.createElement('button');
  const kv = memoryKV(saved === undefined ? {} : { [THEME_KEY]: saved });
  const onChange = vi.fn();
  bindThemeToggle(btn, kv, onChange, root);
  return { root, btn, kv, onChange };
}

describe('parseTheme', () => {
  it('mặc định là sáng, chỉ "dark" mới là tối', () => {
    expect(parseTheme(null)).toBe('light');
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('auto')).toBe('light');
    expect(parseTheme('')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
  });
});

describe('bindThemeToggle', () => {
  it('chưa lưu gì thì giao diện sáng', () => {
    const { root, btn, onChange } = setup();
    expect(root.dataset.theme).toBe('light');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('áp dụng lựa chọn tối đã lưu', () => {
    const { root, btn } = setup('dark');
    expect(root.dataset.theme).toBe('dark');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('giá trị lạ trong kho thì quay về sáng', () => {
    expect(setup('purple').root.dataset.theme).toBe('light');
  });

  it('bấm thì đổi qua lại, ghi nhớ và báo onChange', () => {
    const { root, btn, kv, onChange } = setup();
    btn.click();
    expect(root.dataset.theme).toBe('dark');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(kv.get(THEME_KEY)).toBe('dark');
    expect(onChange).toHaveBeenLastCalledWith('dark');

    btn.click();
    expect(root.dataset.theme).toBe('light');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(kv.get(THEME_KEY)).toBe('light');
    expect(onChange).toHaveBeenLastCalledWith('light');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('kho không ghi được thì vẫn đổi giao diện trong phiên này', () => {
    const root = document.createElement('html');
    const btn = document.createElement('button');
    bindThemeToggle(btn, { get: () => null, set: () => false, remove: () => {} }, undefined, root);
    btn.click();
    expect(root.dataset.theme).toBe('dark');
  });
});
