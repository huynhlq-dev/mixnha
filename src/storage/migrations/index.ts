import { v2ToV3 } from './v2-to-v3';

/** Số phiên bản định dạng hiện tại, dùng cho cả dữ liệu tự lưu và file JSON xuất ra. */
export const CURRENT_VER = 3;

export type RawDoc = Record<string, unknown>;

/**
 * Mỗi lần đổi định dạng: thêm một file migration mới (ví dụ v3-to-v4.ts), đăng ký ở đây
 * dưới khóa là số phiên bản nguồn, rồi tăng CURRENT_VER. Không sửa migration cũ.
 */
const MIGRATIONS: Record<number, (doc: RawDoc) => RawDoc> = {
  2: v2ToV3,
};

/** Đưa tài liệu cũ lên phiên bản hiện tại. Phiên bản không rõ hoặc mới hơn thì trả về nguyên trạng. */
export function migrate(doc: RawDoc): { doc: RawDoc; from: number } {
  const from = Number.isInteger(doc.ver) ? (doc.ver as number) : CURRENT_VER;
  let cur = doc;
  for (let v = from; v < CURRENT_VER; v++) {
    const step = MIGRATIONS[v];
    if (!step) break;
    cur = step(cur);
  }
  return { doc: cur, from };
}
