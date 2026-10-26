import { getLang, loadLang, saveLang, setLang, type Lang } from '../i18n';
import type { DomTranslator } from '../i18n/dom';
import type { KV } from '../storage/kv';

/**
 * Nối các nhóm nút chọn ngôn ngữ (VI | EN; ngoài góc phải còn một nhóm trong hộp thoại Dự án mới, vì hộp thoại chặn nút ngoài trang): áp dụng ngôn ngữ đã lưu ngay lúc khởi động, bấm thì đổi, ghi nhớ và dịch lại phần HTML viết sẵn.
 * onChange chạy sau mỗi lần đổi để app vẽ lại phần do code sinh ra.
 */
export function bindLanguage(groups: HTMLElement | readonly HTMLElement[], kv: KV, dom: DomTranslator, onChange?: (lang: Lang) => void): void {
  const all: readonly HTMLElement[] = 'nodeType' in groups ? [groups] : groups;
  const show = (): void => {
    for (const group of all) for (const b of group.querySelectorAll<HTMLButtonElement>('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === getLang()));
  };
  setLang(loadLang(kv));
  dom.apply();
  show();
  for (const group of all) {
    group.addEventListener('click', (e) => {
      const lang = (e.target as Element).closest<HTMLElement>('[data-lang]')?.dataset.lang;
      if (lang !== 'vi' && lang !== 'en') return;
      if (lang === getLang()) return;
      setLang(lang);
      saveLang(kv, lang);
      dom.apply();
      show();
      onChange?.(lang);
    });
  }
}
