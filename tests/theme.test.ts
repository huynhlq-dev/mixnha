import { describe, expect, it, vi } from 'vitest';
import { memoryKV } from '../src/storage/kv';
import { setLang } from '../src/i18n';
import { bindThemeToggle, nextTheme, parseTheme, THEME_KEY, THEMES } from '../src/ui/theme';

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
    expect(parseTheme('mono')).toBe('mono');
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

  it('bấm thì chuyển sáng → tối → đọc sách → sáng, ghi nhớ và báo onChange', () => {
    const { root, btn, kv, onChange } = setup();
    btn.click();
    expect(root.dataset.theme).toBe('dark');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(kv.get(THEME_KEY)).toBe('dark');
    expect(onChange).toHaveBeenLastCalledWith('dark');

    btn.click();
    expect(root.dataset.theme).toBe('mono');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(kv.get(THEME_KEY)).toBe('mono');
    expect(onChange).toHaveBeenLastCalledWith('mono');

    btn.click();
    expect(root.dataset.theme).toBe('light');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(kv.get(THEME_KEY)).toBe('light');
    expect(onChange).toHaveBeenLastCalledWith('light');
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it('áp dụng giao diện đọc sách đã lưu', () => {
    const { root, btn } = setup('mono');
    expect(root.dataset.theme).toBe('mono');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('chữ và biểu tượng trên nút là giao diện sẽ chuyển tới, đổi theo ngôn ngữ', () => {
    const root = document.createElement('html');
    const btn = document.createElement('button');
    btn.innerHTML = '<svg data-theme-icon></svg><span data-theme-label></span>';
    bindThemeToggle(btn, memoryKV(), undefined, root);
    const text = () => btn.querySelector('[data-theme-label]')!.textContent;
    expect(text()).toBe('Chế độ tối');
    expect(btn.querySelector('svg')!.innerHTML).toContain('path');
    btn.click();
    expect(text()).toBe('Chế độ đọc sách');
    btn.click();
    expect(text()).toBe('Chế độ sáng');
    expect(btn.getAttribute('aria-label')).toBe('Đổi giao diện: Chế độ sáng');
    setLang('en');
    expect(text()).toBe('Light mode');
    expect(btn.getAttribute('aria-label')).toBe('Switch theme: Light mode');
    setLang('vi');
  });

  it('nextTheme đi vòng ba giao diện', () => {
    expect(THEMES.map(nextTheme)).toEqual(['dark', 'mono', 'light']);
  });

  it('kho không ghi được thì vẫn đổi giao diện trong phiên này', () => {
    const root = document.createElement('html');
    const btn = document.createElement('button');
    bindThemeToggle(btn, { get: () => null, set: () => false, remove: () => {} }, undefined, root);
    btn.click();
    expect(root.dataset.theme).toBe('dark');
  });
});
