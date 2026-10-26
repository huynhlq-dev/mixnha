import { escapeHtml } from '../core/format';
import type { RoomEntry, RoomId } from '../data/rooms';
import type { WallKey } from '../data/schema';
import { WALL_KEYS, WALL_NAMES } from '../data/walls';
import { tn } from '../i18n';

/**
 * Các tab chọn phòng: mỗi phòng của căn hộ một tab, theo thứ tự trong danh sách.
 * overview: đang xem mô hình cả căn hộ thì chưa có phòng nào được chọn.
 */
export function roomTabsHtml(rooms: readonly RoomEntry[], current: RoomId, overview = false): string {
  return rooms.map((r) => `<button class="tab" type="button" data-room="${escapeHtml(r.id)}" aria-pressed="${!overview && r.id === current}">${escapeHtml(tn(r.name))}</button>`).join('');
}

/** Các tab chọn tường ở kiểu xem mặt đứng. */
export function wallTabsHtml(current: WallKey): string {
  return WALL_KEYS.map((w) => `<button class="tab" type="button" data-wall="${w}" aria-pressed="${w === current}">${escapeHtml(tn(WALL_NAMES[w]))}</button>`).join('');
}

const MINI_PATH: Record<WallKey, string> = { T: 'M6 6H58', R: 'M58 6V42', B: 'M6 42H58', L: 'M6 6V42' };

/** Sơ đồ nhỏ: khung phòng nhìn từ trên, bức tường đang xem tô đậm. */
export function miniMapHtml(current: WallKey): string {
  return WALL_KEYS.map((w) => {
    const on = w === current;
    return `<path d="${MINI_PATH[w]}" style="fill:none;stroke:${on ? 'var(--accent)' : 'var(--muted)'};stroke-width:${on ? 5 : 2};stroke-linecap:round"/>`;
  }).join('');
}

/**
 * Trên điện thoại hàng tab là một dải cuộn ngang. Cuộn dải để tab đang chọn nằm trong khung nhìn
 * (ví dụ mở lại bản vẽ đang ở "Nhà vệ sinh"). Dải không tràn thì không làm gì.
 */
export function revealActive(strip: HTMLElement): void {
  if (strip.scrollWidth <= strip.clientWidth) return;
  const on = strip.querySelector<HTMLElement>('[aria-pressed="true"]');
  if (!on) return;
  const box = strip.getBoundingClientRect();
  const tab = on.getBoundingClientRect();
  const margin = 8;
  if (tab.left < box.left) strip.scrollLeft -= box.left - tab.left + margin;
  else if (tab.right > box.right) strip.scrollLeft += tab.right - box.right + margin;
}
