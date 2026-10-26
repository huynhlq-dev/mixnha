import { escapeHtml, fm } from '../core/format';
import { countItems } from '../core/layout';
import type { Interior } from '../core/interior';
import type { RoomTypeId } from '../data/rooms';
import type { AptRoom } from '../views/apartment';
import { t, tn } from '../i18n';

const area = (r: AptRoom): number => (r.geo.W * r.geo.H) / 10000;

/** Biểu tượng nhỏ trước tên phòng, để nhìn lướt danh sách là nhận ra loại phòng. */
const ROOM_ICON: Readonly<Record<RoomTypeId, string>> = { ngu: '🛏', khach: '🛋', bep: '🍳', wc: '🚿', lamviec: '💻', trong: '⬜', banchong: '🌿' };
const roomIcon = (type: string): string => ROOM_ICON[type as RoomTypeId] ?? '🏠';

/** Cột trái khi xem cả căn hộ, dưới thư viện: danh sách phòng, bấm để zoom vào thiết kế phòng đó. */
export function aptListHtml(rooms: readonly AptRoom[], areas: Readonly<Record<string, number>> = {}): string {
  const rows = rooms
    .map(
      (r) =>
        `<button class="aptitem" type="button" data-room="${r.id}"><span class="ico" aria-hidden="true">${roomIcon(r.type)}</span><span class="txt"><span class="nm">${escapeHtml(tn(r.name))}</span><span class="sz">${r.geo.W} × ${r.geo.H} cm · ${fm(areas[r.id] ?? area(r))} m² · ${t('{n} món', { n: countItems(r.layout) })}</span></span></button>`,
    )
    .join('');
  return `<h3>${t('Các phòng')}</h3>${rows}<p class="hint">${t('Bấm một phòng ở đây, hoặc bấm đúp một phòng trên mô hình, để zoom vào thiết kế chi tiết. Muốn quay lại cả căn thì bấm nút "Cả căn hộ" ở đầu khung vẽ.')}</p>`;
}

/**
 * Cột phải khi xem cả căn hộ: số liệu tổng. interior là diện tích đã tính cả khoảng trống kín giữa các phòng (hành lang);
 * không có thì chỉ tính các phòng.
 */
export function aptInfoHtml(rooms: readonly AptRoom[], interior?: Interior): string {
  // phòng bị phòng khác che bớt thì chỉ tính phần còn thấy
  const sum = interior ? interior.rooms : rooms.reduce((s, r) => s + area(r), 0);
  const gaps = interior?.gaps ?? 0;
  const items = rooms.reduce((s, r) => s + countItems(r.layout), 0);
  const row = (k: string, v: string, cls = ''): string => `<dt>${escapeHtml(k)}</dt><dd${cls ? ` class="${cls}"` : ''}>${escapeHtml(v)}</dd>`;
  const chip = (icon: string, value: string, label: string, cls = ''): string =>
    `<div class="chip${cls ? ` ${cls}` : ''}"><span class="ci" aria-hidden="true">${icon}</span><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`;
  return (
    `<h3>${t('Cả căn hộ')}</h3>` +
    // ba số cần nhìn lướt là chip lớn; bên dưới chỉ còn phần tách diện tích phòng và hành lang
    `<div class="statchips">${chip('🏠', String(rooms.length), t('Số phòng'))}${chip('📐', `${fm(sum + gaps)} m²`, t('Diện tích trong nhà'), 'tot')}${chip('🪑', String(items), t('Số món đồ'))}</div>` +
    `<dl class="aptstats">${row(t('Diện tích phòng'), `${fm(sum)} m²`)}${gaps >= 0.05 ? row(t('Hành lang, khoảng trống'), `${fm(gaps)} m²`) : ''}</dl>` +
    (gaps >= 0.05 ? `<p class="hint">${t('Khoảng trống kín giữa các phòng (hẹp dưới 1,5 m, tô màu hành lang trên mô hình) được tính vào diện tích trong nhà.')}</p>` : '') +
    `<details class="help"><summary>${t('Hướng dẫn')}</summary><p class="hint">${t('Mô hình cả căn nhìn từ trên: kéo đồ từ thư viện thả vào phòng rồi sửa như thường (chọn, kéo, xoay, đổi màu, cửa). Bật "Chỉnh bố cục" để kéo phòng sang chỗ khác và đổi kích thước phòng; kéo một phòng đè lên phòng khác (hoặc thả phòng mới, kéo rộng ra) thì phòng đó nằm trên và khuyết phần phòng dưới (thành chữ L), kéo ra thì phòng dưới nguyên vẹn lại. Chưa chỉnh thì các phòng tự xếp lưới theo kích thước hiện tại.')}</p></details>`
  );
}
