import { daysSinceExport, type BackupState } from '../storage/backup';

/** Câu hiện cạnh dòng nhắc sao lưu. */
export function remindMessage(s: BackupState, now: number): string {
  const days = daysSinceExport(s, now);
  if (days === null) return 'Bạn chưa xuất file lần nào.';
  if (days === 0) return 'Lần xuất gần nhất là hôm nay.';
  return `Lần xuất gần nhất cách đây ${days} ngày.`;
}
