import { plain } from '../core/format';
import type { Issue } from '../core/validate';
import type { CategoryDef, ItemDef, ItemStatus, Place } from '../data/schema';

/**
 * Phần tính toán của trang gallery: lọc, gom nhóm, đếm. Không đụng tới DOM nên kiểm thử được.
 * Khác thư viện trong trình thiết kế (chỉ thấy món live), gallery thấy mọi món, kể cả draft và retired.
 */

export type StatusFilter = 'all' | ItemStatus;
export type PlaceFilter = 'all' | Place;

export interface GalleryFilter {
  status: StatusFilter;
  place: PlaceFilter;
  query: string;
}

export const ALL_FILTER: GalleryFilter = { status: 'all', place: 'all', query: '' };

export const STATUS_LABEL: Record<ItemStatus, string> = {
  draft: 'Đang làm',
  live: 'Đã đưa lên',
  retired: 'Ngừng dùng',
};

export const PLACE_LABEL: Record<Place, string> = {
  floor: 'Đặt sàn',
  wall: 'Gắn tường',
};

/** Nhóm dành cho món khai báo một mã nhóm không có trong categories.ts. Vẫn hiện để người làm thấy mà sửa. */
export const UNKNOWN_GROUP: CategoryDef = { id: '', name: 'Chưa có nhóm', place: 'floor' };

export interface GalleryGroup {
  cat: CategoryDef;
  items: ItemDef[];
}

/** Món khớp từ khóa tìm kiếm (không phân biệt dấu) theo tên, tên ngắn, mã, ghi chú hoặc kiểu vẽ. */
export function matchesQuery(it: ItemDef, query: string): boolean {
  const q = plain(query.trim());
  if (!q) return true;
  const hay = plain([it.name, it.short ?? '', it.id, it.note ?? '', it.shape ?? ''].join(' '));
  return q.split(/\s+/).every((word) => hay.includes(word));
}

export function filterItems(items: readonly ItemDef[], f: GalleryFilter): ItemDef[] {
  return items.filter((it) => (f.status === 'all' || it.status === f.status) && (f.place === 'all' || it.place === f.place) && matchesQuery(it, f.query));
}

/** Gom món đã lọc theo nhóm, giữ thứ tự nhóm trong categories và thứ tự món trong dữ liệu. Nhóm không còn món nào thì bỏ. */
export function galleryGroups(items: readonly ItemDef[], categories: readonly CategoryDef[], f: GalleryFilter): GalleryGroup[] {
  const shown = filterItems(items, f);
  const known = new Set(categories.map((c) => c.id));
  const groups: GalleryGroup[] = categories.map((cat) => ({ cat, items: shown.filter((it) => it.cat === cat.id) }));
  const orphans = shown.filter((it) => !known.has(it.cat));
  if (orphans.length) groups.push({ cat: UNKNOWN_GROUP, items: orphans });
  return groups.filter((g) => g.items.length > 0);
}

export function countByStatus(items: readonly ItemDef[]): Record<ItemStatus, number> {
  const n: Record<ItemStatus, number> = { draft: 0, live: 0, retired: 0 };
  for (const it of items) if (it.status in n) n[it.status]++;
  return n;
}

/** Các vấn đề của từng món, tra theo mã món. Vấn đề của phòng hoặc nhóm (không phải mã món) bị bỏ. */
export function issuesById(issues: readonly Issue[], items: readonly ItemDef[]): Map<string, Issue[]> {
  const ids = new Set(items.map((it) => it.id));
  const map = new Map<string, Issue[]>();
  for (const is of issues) {
    if (!ids.has(is.where)) continue;
    const list = map.get(is.where);
    if (list) list.push(is);
    else map.set(is.where, [is]);
  }
  return map;
}

export function countIssues(issues: readonly Issue[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const is of issues) {
    if (is.level === 'error') errors++;
    else warnings++;
  }
  return { errors, warnings };
}

/** Dòng tóm tắt đầu trang: tổng số món theo trạng thái và số vấn đề. */
export function summaryText(items: readonly ItemDef[], issues: readonly Issue[]): string {
  const n = countByStatus(items);
  const c = countIssues(issues);
  const parts = [`${items.length} món`, `${n.live} đã đưa lên`, `${n.draft} đang làm`, `${n.retired} ngừng dùng`];
  const bad = c.errors === 0 && c.warnings === 0 ? 'Dữ liệu không có lỗi' : `${c.errors} lỗi, ${c.warnings} cảnh báo`;
  return `${parts.join(' · ')}. ${bad}.`;
}
