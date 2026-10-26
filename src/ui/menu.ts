/** Một menu nhỏ đã nối: đóng, mở bằng code. */
export interface MenuHandle {
  readonly isOpen: boolean;
  close(): void;
}

/**
 * Nối nút với vùng bật ra bên dưới (menu "Khác", bảng phím tắt): bấm nút để mở hoặc đóng; đóng khi bấm ra ngoài, bấm Esc (trả focus về nút),
 * Tab ra ngoài, hoặc bấm một mục role="menuitem" bên trong. Mũi tên lên xuống chuyển giữa các mục. `aria-expanded` của nút luôn khớp trạng thái.
 */
export function bindMenu(btn: HTMLButtonElement, menu: HTMLElement): MenuHandle {
  const wrap = btn.parentElement ?? btn;
  const items = (): HTMLButtonElement[] => [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')];
  const set = (open: boolean): void => {
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', () => set(!!menu.hidden));
  menu.addEventListener('click', (e) => {
    if ((e.target as Element).closest('[role="menuitem"]')) set(false);
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !wrap.contains(e.target as Node)) set(false);
  });
  wrap.addEventListener('focusout', (e) => {
    const to = e.relatedTarget as Node | null;
    if (!menu.hidden && to && !wrap.contains(to)) set(false);
  });
  wrap.addEventListener('keydown', (e) => {
    if (menu.hidden) {
      if (e.key === 'ArrowDown' && e.target === btn) {
        e.preventDefault();
        set(true);
        items()[0]?.focus();
      }
      return;
    }
    if (e.key === 'Escape') {
      // đã xử lý ở đây: phím tắt chung của bản vẽ (Esc bỏ chọn) bỏ qua
      e.preventDefault();
      set(false);
      btn.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const list = items();
      if (!list.length) return;
      e.preventDefault();
      const i = list.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i <= 0 ? list.length : i) - 1;
      list[next]?.focus();
    }
  });
  return {
    get isOpen() {
      return !menu.hidden;
    },
    close: () => set(false),
  };
}
