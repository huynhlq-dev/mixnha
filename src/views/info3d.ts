import { analysePlan } from '../core/analyse';
import { fm } from '../core/format';
import type { Registry } from '../core/registry';
import type { RoomGeo } from '../core/room';
import type { Layout } from '../core/types';
import type { Interior } from '../core/interior';
import type { AptRoom } from './apartment';
import type { Frame } from './frame';
import { t, tn } from '../i18n';

export type Info3D = Pick<Frame, 'title' | 'size' | 'area' | 'status'>;

/** Dòng tiêu đề và trạng thái của kiểu xem 3D. failed: không dựng được WebGL. */
export function describe3D(layout: Layout, R: RoomGeo, reg: Registry, failed: boolean): Info3D {
  const bad = analysePlan(layout, R, reg).bad.size;
  let status: Frame['status'];
  if (failed) {
    status = { tone: 'warn', text: t('Chưa dựng được 3D trên trình duyệt này. Mặt bằng và mặt đứng vẫn dùng bình thường.') };
  } else if (bad > 0) {
    status = { tone: 'bad', text: t('{n} món đang chồng lấn, nằm ngoài phòng hoặc chắn vùng mở cửa (khung cam).', { n: bad }) };
  } else {
    status = { tone: 'info', text: t('Bấm vào món để chọn, kéo món để di chuyển, kéo vào chỗ trống để xoay 360°. Kéo món từ thư viện thả thẳng vào phòng.') };
  }
  return { title: `${tn(R.name)} · 3D`, size: `${R.W} × ${R.H} × ${R.ceil} cm`, area: `${fm((R.W * R.H) / 10000)} m²`, status };
}

/** Dòng tiêu đề và trạng thái của kiểu xem 3D cả căn hộ (chỉ để xem). */
export function describeApartment3D(rooms: readonly AptRoom[], failed: boolean, interior?: Interior): Info3D {
  // diện tích trong nhà: các phòng cộng khoảng trống kín giữa các phòng (hành lang) nếu đã tính
  const area = interior ? interior.total : rooms.reduce((a, r) => a + (r.geo.W * r.geo.H) / 10000, 0);
  const status: Frame['status'] = failed
    ? { tone: 'warn', text: t('Chưa dựng được 3D trên trình duyệt này. Mặt bằng cả căn hộ vẫn dùng bình thường.') }
    : { tone: 'info', text: t('Kéo để xoay 360°, cuộn hoặc chụm hai ngón để phóng to. 3D cả căn hộ chỉ để xem: muốn sửa đồ thì quay về Mặt bằng, hoặc zoom vào một phòng.') };
  return { title: t('Cả căn hộ · 3D'), size: t('{n} phòng', { n: rooms.length }), area: `${fm(area)} m²`, status };
}
