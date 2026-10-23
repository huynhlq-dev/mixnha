import type { KV } from '../storage/kv';

export type Theme = 'light' | 'dark';

/** Khóa lưu lựa chọn giao diện. Đoạn script nhỏ ở đầu index.html và gallery.html đọc đúng khóa này. */
export const THEME_KEY = 'xepnha2d:theme';

/** Mặc định luôn là sáng, không theo cài đặt của máy. Chỉ khi người dùng bấm nút mới chuyển sang tối. */
export const parseTheme = (raw: string | null): Theme => (raw === 'dark' ? 'dark' : 'light');

/**
 * Nối nút đổi giao diện sáng, tối: áp dụng lựa chọn đã lưu, bấm thì đổi và ghi nhớ.
 * data-theme thường đã được đặt từ trước khi vẽ trang (script ở đầu trang) để không bị nháy sáng.
 * onChange chạy sau mỗi lần bấm, để phần vẽ 3D dựng lại màu.
 */
export function bindThemeToggle(btn: HTMLButtonElement, kv: KV, onChange?: (theme: Theme) => void, root: HTMLElement = document.documentElement): void {
  const show = (t: Theme): void => {
    root.dataset.theme = t;
    btn.setAttribute('aria-pressed', String(t === 'dark'));
  };
  show(parseTheme(kv.get(THEME_KEY)));
  btn.addEventListener('click', () => {
    const next: Theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    show(next);
    kv.set(THEME_KEY, next);
    onChange?.(next);
  });
}
