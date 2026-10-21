import type { Dir } from '../core/ops';
import type { Mode } from '../views/host';

/** Thông tin một lần bấm phím, đã bỏ bớt cho thuần để kiểm thử được mà không cần trình duyệt. */
export interface KeyInfo {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  /** Đang gõ chữ trong ô nhập: phím là của ô đó, không phải phím tắt của bản vẽ. */
  typing: boolean;
  /** Phím nằm trong một hộp thoại đang mở: hộp thoại tự lo. */
  inDialog: boolean;
  /** Đã có nơi khác xử lý (ví dụ khung 3D tự xử lý mũi tên, R, Delete). */
  handled: boolean;
}

export interface KeyContext {
  mode: Mode;
  hasSel: boolean;
  /** Món đang chọn là đồ đặt sàn, tức xoay được. */
  selFloor: boolean;
}

export type KeyAction =
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'remove' }
  | { type: 'rotate'; delta: number }
  | { type: 'nudge'; dir: Dir; step: number }
  | { type: 'escape' };

const ARROWS: Record<string, Dir> = { arrowleft: 'left', arrowright: 'right', arrowup: 'up', arrowdown: 'down' };

/** Phím tắt của bản vẽ. Trả về việc cần làm, hoặc null nếu phím này không phải phím tắt (lúc này). */
export function keyAction(k: KeyInfo, c: KeyContext): KeyAction | null {
  if (k.handled || k.inDialog) return null;
  const key = k.key.toLowerCase();
  if (key === 'escape') return { type: 'escape' };
  if (k.typing) return null;
  if (k.ctrl || k.meta) {
    if (k.alt) return null;
    if (key === 'z') return k.shift ? { type: 'redo' } : { type: 'undo' };
    if (key === 'y' && !k.shift) return { type: 'redo' };
    return null;
  }
  if (k.alt || !c.hasSel) return null;
  if (key === 'delete' || key === 'backspace') return { type: 'remove' };
  if (key === 'r') return c.selFloor ? { type: 'rotate', delta: k.shift ? -90 : 90 } : null;
  const dir = ARROWS[key];
  // trong 3D mũi tên là để xoay camera, khung 3D tự xử lý khi đang được chọn
  if (dir && c.mode !== '3d') return { type: 'nudge', dir, step: k.shift ? 25 : 5 };
  return null;
}

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

/** Gắn phím tắt cho cả trang. Trả về hàm gỡ. */
export function bindKeys(ctx: () => KeyContext, run: (a: KeyAction) => void): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.isComposing) return;
    const t = e.target as Element | null;
    const input = e.target instanceof HTMLInputElement ? e.target : null;
    // ô chọn màu, ô tích chọn và nút là "input" nhưng không nhận chữ: phím tắt vẫn dùng được
    const typing = isTyping(e.target) && !(input && ['color', 'checkbox', 'radio', 'button', 'range', 'file'].includes(input.type));
    const act = keyAction(
      {
        key: e.key,
        ctrl: e.ctrlKey,
        meta: e.metaKey,
        alt: e.altKey,
        shift: e.shiftKey,
        typing,
        inDialog: !!t?.closest?.('dialog'),
        handled: e.defaultPrevented,
      },
      ctx(),
    );
    if (!act) return;
    if (act.type !== 'escape') e.preventDefault();
    run(act);
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
