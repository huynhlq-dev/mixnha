import { onLang, t } from '../i18n';
import type { KV } from '../storage/kv';

/** sáng, tối, hoặc đọc sách: không màu, giống máy đọc sách (thang xám, tương phản cao, không đổ bóng). */
export type Theme = 'light' | 'dark' | 'mono';

/** Thứ tự chuyển khi bấm nút giao diện: sáng → tối → đọc sách → sáng. */
export const THEMES: readonly Theme[] = ['light', 'dark', 'mono'];

/** Khóa lưu lựa chọn giao diện. Đoạn script nhỏ ở đầu index.html và gallery.html đọc đúng khóa này. */
export const THEME_KEY = 'xepnha2d:theme';

/** Giao diện khi chưa chọn gì: đọc sách (không màu), không theo cài đặt của máy. Lựa chọn đã lưu (kể cả sáng) luôn được giữ. */
export const DEFAULT_THEME: Theme = 'mono';

export const parseTheme = (raw: string | null): Theme => (raw === 'light' || raw === 'dark' || raw === 'mono' ? raw : DEFAULT_THEME);

export const nextTheme = (current: Theme): Theme => THEMES[(THEMES.indexOf(current) + 1) % THEMES.length]!;

/** Chữ trên nút: tên giao diện sẽ chuyển tới khi bấm. */
export function themeLabel(next: Theme): string {
  return next === 'dark' ? t('Chế độ tối') : next === 'mono' ? t('Chế độ đọc sách') : t('Chế độ sáng');
}

/** Biểu tượng của giao diện sẽ chuyển tới: trăng (tối), sách (đọc sách), mặt trời (sáng). */
const ICON: Record<Theme, string> = {
  dark: '<path d="M13.6 9.8A5.8 5.8 0 0 1 6.2 2.4a5.8 5.8 0 1 0 7.4 7.4Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />',
  mono: '<path d="M2.5 3.5h4.2c.8 0 1.3.5 1.3 1.3v8c0-.8-.5-1.3-1.3-1.3H2.5zM13.5 3.5H9.3C8.5 3.5 8 4 8 4.8v8c0-.8.5-1.3 1.3-1.3h4.2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />',
  light: '<circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />',
};

/**
 * Nối nút đổi giao diện (sáng → tối → đọc sách): áp dụng lựa chọn đã lưu, bấm thì chuyển giao diện kế tiếp và ghi nhớ.
 * data-theme thường đã được đặt từ trước khi vẽ trang (script ở đầu trang) để không bị nháy sáng.
 * onChange chạy sau mỗi lần bấm, để phần vẽ 3D dựng lại màu. Nút có thể có phần tử [data-theme-label] (chữ) và [data-theme-icon] (biểu tượng) để đổi theo.
 */
export function bindThemeToggle(btn: HTMLButtonElement, kv: KV, onChange?: (theme: Theme) => void, root: HTMLElement = document.documentElement): void {
  const label = btn.querySelector<HTMLElement>('[data-theme-label]');
  const icon = btn.querySelector<SVGElement>('[data-theme-icon]');
  let current: Theme = parseTheme(kv.get(THEME_KEY));
  const paint = (): void => {
    const next = nextTheme(current);
    root.dataset.theme = current;
    // "bật" nghĩa là đang không ở giao diện sáng
    btn.setAttribute('aria-pressed', String(current !== 'light'));
    btn.setAttribute('aria-label', `${t('Đổi giao diện')}: ${themeLabel(next)}`);
    if (label) label.textContent = themeLabel(next);
    if (icon) icon.innerHTML = ICON[next];
  };
  paint();
  btn.addEventListener('click', () => {
    current = nextTheme(current);
    paint();
    kv.set(THEME_KEY, current);
    onChange?.(current);
  });
  // đổi ngôn ngữ thì viết lại chữ trên nút
  onLang(paint);
}
