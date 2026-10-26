import { escapeHtml } from '../core/format';
import { healthLevel, type HealthCheck, type HealthLevel } from '../core/health';
import { t, tn } from '../i18n';

const ICON: Record<HealthLevel, string> = { ok: '✓', warn: '!', bad: '✕' };

const label = (level: HealthLevel): string => (level === 'ok' ? t('Ổn') : level === 'warn' ? t('Nên xem lại') : t('Cần sửa'));

/** Tiêu đề thu gọn của khung: tên khung và huy hiệu mức chung. */
function summaryHtml(level: HealthLevel): string {
  return `<summary><span>${t('Kiểm tra thiết kế')}</span><span class="hbadge ${level}"><i aria-hidden="true">${ICON[level]}</i>${label(level)}</span></summary>`;
}

const rowHtml = (level: HealthLevel, text: string): string =>
  `<li class="hl ${level}"><i class="hi" aria-hidden="true">${ICON[level]}</i><span>${escapeHtml(text)}</span></li>`;

/** Khung "Kiểm tra thiết kế" của một phòng: mỗi mục một dòng có màu và biểu tượng (xanh đạt, vàng nên xem lại, cam lỗi). */
export function healthHtml(checks: readonly HealthCheck[]): string {
  return `${summaryHtml(healthLevel(checks))}<ul class="health">${checks.map((c) => rowHtml(c.level, c.text)).join('')}</ul>`;
}

export interface RoomHealth {
  name: string;
  checks: readonly HealthCheck[];
}

/** Khung kiểm tra cho cả căn hộ: mỗi phòng một dòng, ghi các vấn đề của phòng đó hoặc "Không có vấn đề". */
export function apartmentHealthHtml(rooms: readonly RoomHealth[]): string {
  const all = rooms.flatMap((r) => r.checks);
  const rows = rooms.map((r) => {
    const level = healthLevel(r.checks);
    const problems = r.checks.filter((c) => c.level !== 'ok').map((c) => c.text);
    return rowHtml(level, `${tn(r.name)}: ${problems.length ? problems.join('; ') : t('Không có vấn đề')}`);
  });
  return `${summaryHtml(healthLevel(all))}<ul class="health">${rows.join('')}</ul>`;
}
