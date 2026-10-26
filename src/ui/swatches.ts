import { escapeHtml } from '../core/format';
import { normHex } from '../core/color';
import type { NamedColor } from '../data/schema';
import { t, tn } from '../i18n';

/** Ô màu thuộc nhóm nào: sàn, tường, món đang chọn, hoặc màu gần đây của bút. */
export type SwatchKey = 'floor' | 'wall' | 'item' | 'pen';

/** Dãy ô màu gợi ý cộng một ô chọn màu tùy ý. */
export function swatchesHtml(key: Exclude<SwatchKey, 'pen'>, colors: readonly NamedColor[]): string {
  const fixed = colors
    .map((c) => `<button class="swatch" type="button" data-k="${key}" data-c="${c.hex.toLowerCase()}" style="background:${c.hex}" aria-label="${escapeHtml(tn(c.name))}" aria-pressed="false"></button>`)
    .join('');
  return `${fixed}<label class="swatch custom" data-on="false" title="${t('Màu tùy chọn')}"><input type="color" data-k="${key}" value="#ffffff" aria-label="${t('Màu tùy chọn')}"></label>`;
}

/** Các màu bút dùng gần đây, màu đang chọn được đánh dấu. */
export function recentHtml(recent: readonly string[], current: string): string {
  if (!recent.length) return `<span class="empty">${t('Chưa có màu nào.')}</span>`;
  return recent
    .map((c) => `<button class="swatch" type="button" data-k="pen" data-c="${c}" style="background:${c}" aria-label="${t('Màu {c}', { c })}" aria-pressed="${c === current}"></button>`)
    .join('');
}

/** Đánh dấu ô màu đang dùng. Màu không nằm trong dãy gợi ý thì ô tùy chọn sáng lên và hiện đúng màu đó. */
export function markSwatches(box: HTMLElement, value: string): void {
  const v = value.toLowerCase();
  let hit = false;
  for (const b of box.querySelectorAll<HTMLButtonElement>('button.swatch')) {
    const on = (b.dataset.c ?? '').toLowerCase() === v;
    if (on) hit = true;
    b.setAttribute('aria-pressed', String(on));
  }
  const custom = box.querySelector<HTMLElement>('.swatch.custom');
  if (!custom) return;
  const hex = normHex(v);
  const input = custom.querySelector('input');
  custom.dataset.on = String(!hit && !!hex);
  custom.style.background = !hit && hex ? hex : '';
  if (hex && input && document.activeElement !== input) input.value = hex;
}

export interface SwatchApp {
  /** click: bấm một ô màu có sẵn. live: đang kéo trong bảng chọn màu. done: chọn xong. */
  pickColor(key: SwatchKey, hex: string, how: 'click' | 'live' | 'done'): void;
}

/** Gắn sự kiện cho các nhóm ô màu (sàn, tường, món, màu gần đây của bút). */
export function bindSwatches(boxes: readonly HTMLElement[], app: SwatchApp): void {
  for (const box of boxes) {
    box.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>('button.swatch[data-c]');
      if (b?.dataset.k && b.dataset.c) app.pickColor(b.dataset.k as SwatchKey, b.dataset.c, 'click');
    });
    for (const [type, how] of [['input', 'live'], ['change', 'done']] as const) {
      box.addEventListener(type, (e) => {
        const i = e.target as HTMLInputElement;
        if (i.matches?.('input[type="color"][data-k]')) app.pickColor(i.dataset.k as SwatchKey, i.value, how);
      });
    }
  }
}
