import type { Issue } from '../src/core/validate';
import type { ItemDef } from '../src/data/schema';

/**
 * Định dạng kết quả kiểm tra dữ liệu thành văn bản cho dòng lệnh. Tách khỏi validate-items.ts để kiểm thử được
 * mà không cần chạy lệnh hay đọc dữ liệu thật.
 */

export interface Report {
  text: string;
  errors: number;
  warnings: number;
}

export interface ReportOptions {
  /** Tô màu bằng mã ANSI (đỏ cho lỗi, vàng cho cảnh báo). Tắt khi ghi ra file hoặc khi chạy trong CI. */
  color?: boolean;
}

const RED = '\u001b[31m';
const YELLOW = '\u001b[33m';
const GREEN = '\u001b[32m';
const DIM = '\u001b[2m';
const RESET = '\u001b[0m';

export function buildReport(items: readonly ItemDef[], issues: readonly Issue[], opts: ReportOptions = {}): Report {
  const paint = (code: string, s: string): string => (opts.color ? `${code}${s}${RESET}` : s);
  const count = (st: ItemDef['status']): number => items.filter((it) => it.status === st).length;
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warn');

  const lines: string[] = [];
  lines.push(`Kiểm tra dữ liệu đồ: ${items.length} món (${count('live')} live, ${count('draft')} draft, ${count('retired')} retired)`);

  const section = (title: string, list: readonly Issue[], color: string): void => {
    if (list.length === 0) return;
    lines.push('', paint(color, `${title} (${list.length})`));
    // gom theo món hoặc phòng để dễ đọc, giữ thứ tự xuất hiện
    const order: string[] = [];
    const byWhere = new Map<string, Issue[]>();
    for (const is of list) {
      if (!byWhere.has(is.where)) {
        byWhere.set(is.where, []);
        order.push(is.where);
      }
      byWhere.get(is.where)!.push(is);
    }
    for (const where of order) {
      lines.push(`  ${where}`);
      for (const is of byWhere.get(where)!) {
        const field = is.field ? paint(DIM, ` [${is.field}]`) : '';
        lines.push(`    - ${is.message}${field}`);
      }
    }
  };
  section('LỖI', errors, RED);
  section('CẢNH BÁO', warnings, YELLOW);

  lines.push('');
  if (errors.length === 0 && warnings.length === 0) lines.push(paint(GREEN, 'Không có lỗi, không có cảnh báo.'));
  else lines.push(`Kết quả: ${errors.length} lỗi, ${warnings.length} cảnh báo.`);
  return { text: lines.join('\n'), errors: errors.length, warnings: warnings.length };
}

/** Mã thoát của lệnh: 1 nếu có lỗi; với --strict thì cảnh báo cũng tính là lỗi. */
export function exitCode(r: Pick<Report, 'errors' | 'warnings'>, strict: boolean): number {
  return r.errors > 0 || (strict && r.warnings > 0) ? 1 : 0;
}
