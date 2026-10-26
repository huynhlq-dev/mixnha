import { normHex } from '../core/color';
import { findItem } from '../core/layout';
import type { Layout } from '../core/types';
import type { PenTarget, PenTool } from '../views/host';
import type { Els } from './els';
import { recentHtml } from './swatches';
import { t } from '../i18n';

export const MAX_RECENT = 8;

/** Đưa màu vừa dùng lên đầu danh sách màu gần đây, bỏ trùng, giữ tối đa 8 màu. */
export function rememberColor(recent: readonly string[], hex: string): string[] {
  return [hex, ...recent.filter((c) => c !== hex)].slice(0, MAX_RECENT);
}

/**
 * Khối Bút màu chỉ hiện khi có món đang chọn. Đang dùng bút (lấy màu, chấm màu) thì vẫn hiện dù bỏ chọn món,
 * nếu không bút còn bật mà nút của nó đã biến mất.
 */
export function penShown(hasSel: boolean, tool: PenTool): boolean {
  return hasSel || tool !== null;
}

export function penHint(tool: PenTool): string {
  if (tool === 'pick') return t('Bấm vào một món, sàn hoặc tường để hút màu của nó. Xong bút tự chuyển sang chấm màu.');
  if (tool === 'paint') return t('Bấm vào món, sàn hoặc tường để chấm màu này. Bấm Esc hoặc bấm lại nút để thoát.');
  return t('Chọn Lấy màu để hút màu từ bản vẽ, hoặc Chấm màu để tô nhanh bằng màu đang chọn.');
}

/** Màu hiện tại của chỗ mà bút chạm vào, hoặc null nếu không tìm thấy món. */
export function colorAt(l: Layout, t: PenTarget): string | null {
  if (t.kind === 'floor') return l.floor;
  if (t.kind === 'wall') return l.wall;
  return findItem(l, t.sel)?.color ?? null;
}

/** Tô màu cho chỗ bút chạm vào. Món đã khóa vẫn đổi màu được. Trả về false nếu không tìm thấy món. */
export function paintAt(l: Layout, t: PenTarget, hex: string): boolean {
  if (t.kind === 'floor') {
    l.floor = hex;
    return true;
  }
  if (t.kind === 'wall') {
    l.wall = hex;
    return true;
  }
  const it = findItem(l, t.sel);
  if (!it) return false;
  it.color = hex;
  return true;
}

/* ---------- Giao diện của bút màu ---------- */

export interface PenView {
  color: string;
  recent: readonly string[];
}

export function updatePenUi(els: Els, pen: PenView, tool: PenTool): void {
  if (document.activeElement !== els.penHex) els.penHex.value = pen.color.toUpperCase();
  if (document.activeElement !== els.penColor) els.penColor.value = pen.color;
  els.penPick.setAttribute('aria-pressed', String(tool === 'pick'));
  els.penPaint.setAttribute('aria-pressed', String(tool === 'paint'));
  els.penHint.textContent = penHint(tool);
  const html = recentHtml(pen.recent, pen.color);
  if (els.penRecent.dataset.html !== html) {
    els.penRecent.innerHTML = html;
    els.penRecent.dataset.html = html;
  }
  els.plan.classList.toggle('pen-on', !!tool);
  els.view3d.classList.toggle('pen-on', !!tool);
}

export interface PenApp {
  /** live: đang kéo trong bảng chọn màu hoặc đang gõ mã. done: chọn xong, nhớ vào màu gần đây. */
  setPenColor(hex: string, how: 'live' | 'done'): void;
  toggleTool(tool: 'pick' | 'paint'): void;
  /** Đưa các ô bút về đúng với trạng thái hiện tại (khi người dùng gõ mã màu sai rồi rời ô). */
  syncPen(): void;
}

export function bindPen(els: Els, app: PenApp): void {
  els.penColor.addEventListener('input', () => {
    const c = normHex(els.penColor.value);
    if (c) app.setPenColor(c, 'live');
  });
  els.penColor.addEventListener('change', () => {
    const c = normHex(els.penColor.value);
    if (c) app.setPenColor(c, 'done');
  });
  const typed = (): string | null => {
    const raw = els.penHex.value.trim();
    return normHex(raw.startsWith('#') ? raw : `#${raw}`);
  };
  els.penHex.addEventListener('input', () => {
    const c = typed();
    if (c) app.setPenColor(c, 'live');
  });
  els.penHex.addEventListener('change', () => {
    const c = typed();
    if (c) app.setPenColor(c, 'done');
    else app.syncPen();
  });
  els.penPick.addEventListener('click', () => app.toggleTool('pick'));
  els.penPaint.addEventListener('click', () => app.toggleTool('paint'));
}
