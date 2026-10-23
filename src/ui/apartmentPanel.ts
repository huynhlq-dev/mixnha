import { escapeHtml, fm } from '../core/format';
import { countItems } from '../core/layout';
import type { AptRoom } from '../views/apartment';

const area = (r: AptRoom): number => (r.geo.W * r.geo.H) / 10000;

/** Cột trái khi xem cả căn hộ, dưới thư viện: danh sách phòng, bấm để zoom vào thiết kế phòng đó. */
export function aptListHtml(rooms: readonly AptRoom[]): string {
  const rows = rooms
    .map(
      (r) =>
        `<button class="aptitem" type="button" data-room="${r.id}"><span class="nm">${escapeHtml(r.name)}</span><span class="sz">${r.geo.W} × ${r.geo.H} cm · ${fm(area(r))} m² · ${countItems(r.layout)} món</span></button>`,
    )
    .join('');
  return `<h3>Các phòng</h3>${rows}<p class="hint">Bấm một phòng ở đây, hoặc bấm đúp một phòng trên mô hình, để zoom vào thiết kế chi tiết. Muốn quay lại cả căn thì bấm nút "Cả căn hộ" ở đầu khung vẽ.</p>`;
}

/** Cột phải khi xem cả căn hộ: số liệu tổng. */
export function aptInfoHtml(rooms: readonly AptRoom[]): string {
  const total = rooms.reduce((s, r) => s + area(r), 0);
  const items = rooms.reduce((s, r) => s + countItems(r.layout), 0);
  const row = (k: string, v: string): string => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`;
  return (
    `<h3>Cả căn hộ</h3>` +
    `<dl class="aptstats">${row('Số phòng', String(rooms.length))}${row('Diện tích sàn', `${fm(total)} m²`)}${row('Số món đồ', String(items))}</dl>` +
    `<p class="hint">Mô hình cả căn nhìn từ trên: kéo đồ từ thư viện thả vào phòng rồi sửa như thường (chọn, kéo, xoay, đổi màu, cửa). Bật "Chỉnh bố cục" để kéo phòng sang chỗ khác và đổi kích thước phòng; chưa chỉnh thì các phòng tự xếp lưới theo kích thước hiện tại.</p>`
  );
}
