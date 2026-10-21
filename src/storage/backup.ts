import type { KV } from './kv';

/** Khóa riêng trong trình duyệt, không nằm trong file bản vẽ và không nằm trong lịch sử Hoàn tác. */
export const BACKUP_KEY = 'xepnha2d:backup';

export const REMIND_AFTER_DAYS = 7;
export const SNOOZE_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

export interface BackupState {
  /** Lần xuất file gần nhất (mili giây). */
  lastExportAt?: number;
  /** Lúc bản vẽ bắt đầu có thay đổi chưa xuất. Không có nghĩa là mọi thứ đã được sao lưu. */
  dirtySince?: number;
  /** Người dùng bấm Để sau: không nhắc cho tới lúc này. */
  snoozeUntil?: number;
}

/** Có thay đổi mới. Chỉ ghi nhớ lần đầu tiên kể từ lần xuất gần nhất. */
export function markDirty(s: BackupState, now: number): BackupState {
  return s.dirtySince === undefined ? { ...s, dirtySince: now } : s;
}

export function markExported(_s: BackupState, now: number): BackupState {
  return { lastExportAt: now };
}

export function snooze(s: BackupState, now: number): BackupState {
  return { ...s, snoozeUntil: now + SNOOZE_DAYS * DAY };
}

/**
 * Nhắc khi có thay đổi chưa xuất và đã quá 7 ngày kể từ lần xuất gần nhất
 * (chưa xuất lần nào thì tính từ lúc bắt đầu có thay đổi). Đang ở chế độ Để sau thì không nhắc.
 */
export function shouldRemind(s: BackupState, now: number): boolean {
  if (s.dirtySince === undefined) return false;
  if (s.snoozeUntil !== undefined && now < s.snoozeUntil) return false;
  const base = s.lastExportAt ?? s.dirtySince;
  return now - base >= REMIND_AFTER_DAYS * DAY;
}

/** Số ngày tròn kể từ lần xuất gần nhất, hoặc null nếu chưa xuất lần nào. */
export function daysSinceExport(s: BackupState, now: number): number | null {
  return s.lastExportAt === undefined ? null : Math.max(0, Math.floor((now - s.lastExportAt) / DAY));
}

export function loadBackup(kv: KV): BackupState {
  const raw = kv.get(BACKUP_KEY);
  if (!raw) return {};
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
    return { lastExportAt: num(p.lastExportAt), dirtySince: num(p.dirtySince), snoozeUntil: num(p.snoozeUntil) };
  } catch {
    return {};
  }
}

export function saveBackup(kv: KV, s: BackupState): void {
  kv.set(BACKUP_KEY, JSON.stringify(s));
}
