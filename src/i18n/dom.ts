import { getLang, t } from './index';

/** Thuộc tính chữ cần dịch trên phần tử HTML tĩnh. */
const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'] as const;

type Entry = { node: Text; vi: string; pre: string; post: string } | { el: Element; attr: string; vi: string };

/** Gộp khoảng trắng liền nhau thành một dấu cách, bỏ đầu cuối: dạng chuẩn của một đoạn chữ trong HTML tĩnh, cũng là khóa tra từ điển. */
export const normalizeText = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * Dịch phần HTML viết sẵn trong index.html, gallery.html. Quét một lần lúc khởi động (collect), nhớ câu tiếng Việt gốc của từng đoạn chữ
 * và thuộc tính, rồi apply() đặt lại theo ngôn ngữ đang dùng. Phần do code sinh ra sau đó tự gọi t() khi vẽ nên không nằm ở đây.
 * Phần tử có data-i18n-skip (và con của nó) được bỏ qua.
 */
export class DomTranslator {
  private entries: Entry[] = [];

  collect(root: Document | Element = document): void {
    const walk = (el: Element): void => {
      if (el.hasAttribute('data-i18n-skip') || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
      for (const attr of ATTRS) {
        const v = el.getAttribute(attr);
        if (v && normalizeText(v)) this.entries.push({ el, attr, vi: normalizeText(v) });
      }
      if (el.tagName === 'META' && el.getAttribute('name') === 'description') {
        const v = el.getAttribute('content');
        if (v) this.entries.push({ el, attr: 'content', vi: normalizeText(v) });
      }
      for (const child of el.childNodes) {
        if (child.nodeType === 3) {
          const text = child.nodeValue ?? '';
          const vi = normalizeText(text);
          if (!vi) continue;
          const pre = /^\s*/.exec(text)![0];
          const post = /\s*$/.exec(text)![0];
          this.entries.push({ node: child as Text, vi, pre, post });
        } else if (child.nodeType === 1) walk(child as Element);
      }
    };
    walk(root instanceof Document ? root.documentElement : root);
  }

  /** Đặt chữ theo ngôn ngữ đang dùng. */
  apply(): void {
    for (const e of this.entries) {
      const text = getLang() === 'vi' ? e.vi : t(e.vi);
      if ('node' in e) {
        if (e.node.isConnected) e.node.nodeValue = e.pre + text + e.post;
      } else e.el.setAttribute(e.attr, text);
    }
    document.documentElement.lang = getLang();
  }

  /** Mọi câu tiếng Việt gốc đã quét (để kiểm tra từ điển đủ chưa). */
  keys(): string[] {
    return [...new Set(this.entries.map((e) => e.vi))];
  }
}
