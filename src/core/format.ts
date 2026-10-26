import { decimalMark } from '../i18n';

/** Số làm tròn tới 0,1, dấu thập phân theo ngôn ngữ đang dùng (phẩy kiểu Việt Nam, chấm kiểu Anh). */
export function fm(n: number): string {
  return String(Math.round(n * 10) / 10).replace('.', decimalMark());
}

/** Bỏ dấu tiếng Việt và viết thường, dùng để tìm kiếm không phân biệt dấu. */
export function plain(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();
}

export function escapeHtml(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
