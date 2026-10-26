import { daysSinceExport, type BackupState } from '../storage/backup';
import { t } from '../i18n';

/** Câu hiện cạnh dòng nhắc sao lưu. */
export function remindMessage(s: BackupState, now: number): string {
  const days = daysSinceExport(s, now);
  if (days === null) return t('Bạn chưa xuất file lần nào.');
  if (days === 0) return t('Lần xuất gần nhất là hôm nay.');
  return t('Lần xuất gần nhất cách đây {n} ngày.', { n: days });
}
