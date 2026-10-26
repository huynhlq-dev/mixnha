import type { KV } from '../storage/kv';
import { EN } from './en';

/**
 * Đa ngôn ngữ. Tiếng Việt là ngôn ngữ gốc: chính câu tiếng Việt trong code là khóa tra từ điển (en.ts), nên
 * t('Đã thêm {name}', { name }) hiện đúng câu đó ở tiếng Việt và câu tiếng Anh tương ứng ở tiếng Anh. Câu nào chưa có bản dịch thì giữ nguyên
 * tiếng Việt. Module này không import gì ngoài từ điển, để mọi tầng đều dùng được.
 */
export type Lang = 'vi' | 'en';

export const LANGS: readonly Lang[] = ['vi', 'en'];
/** Khóa lưu ngôn ngữ đã chọn. Mặc định là tiếng Việt, chỉ đổi khi người dùng bấm nút. */
export const LANG_KEY = 'xepnha2d:lang';

export const parseLang = (raw: string | null | undefined): Lang => (raw === 'en' ? 'en' : 'vi');

type Params = Readonly<Record<string, string | number>>;

let current: Lang = 'vi';
const listeners = new Set<(lang: Lang) => void>();

export const getLang = (): Lang => current;

/** Đổi ngôn ngữ và báo cho những nơi đã đăng ký (onLang) để vẽ lại. */
export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  for (const fn of [...listeners]) fn(lang);
}

/** Đăng ký nhận báo khi đổi ngôn ngữ. Trả về hàm hủy đăng ký. */
export function onLang(fn: (lang: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const loadLang = (kv: KV): Lang => parseLang(kv.get(LANG_KEY));
export const saveLang = (kv: KV, lang: Lang): boolean => kv.set(LANG_KEY, lang);

/**
 * Dịch một câu. `key` là câu tiếng Việt. Chỗ có {tên} được thay bằng params[tên]. Bản dịch có dạng "số ít|số nhiều" và params.n là số
 * thì chọn theo n (n = 1 là số ít), ví dụ '{n} room|{n} rooms'.
 */
export function t(key: string, params?: Params): string {
  let s = key;
  if (current !== 'vi') {
    const tr = EN[key];
    if (tr !== undefined) {
      s = tr;
      if (params && typeof params.n === 'number' && s.includes('|')) {
        const [one, many] = s.split('|') as [string, string];
        s = params.n === 1 ? one : many;
      }
    }
  }
  return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s;
}

/**
 * Dịch một tên (tên món, tên nhóm, tên phòng...). Tên có số cuối ("Phòng ngủ 2") thì dịch phần chữ rồi giữ số. Tên người dùng tự đặt
 * không có trong từ điển nên giữ nguyên.
 */
export function tn(name: string): string {
  if (current === 'vi') return name;
  const direct = EN[name];
  if (direct !== undefined) return direct;
  const m = /^(.*\S)\s+(\d+)$/.exec(name);
  const base = m ? EN[m[1]!] : undefined;
  return m && base !== undefined ? `${base} ${m[2]}` : name;
}

/** Dấu thập phân của ngôn ngữ đang dùng: phẩy (Việt), chấm (Anh). */
export const decimalMark = (): string => (current === 'vi' ? ',' : '.');
