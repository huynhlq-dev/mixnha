import { t } from '../i18n';
import type { KV } from '../storage/kv';
import type { Mode } from '../views/host';

/** Khóa lưu những gợi ý đã hiện (mỗi gợi ý chỉ hiện một lần cho mỗi trình duyệt). */
export const TIPS_KEY = 'xepnha2d:tips';
/** Gợi ý tự ẩn sau chừng này mili giây nếu người dùng không đóng. */
export const TIP_MS = 12_000;

export type TipId = 'zoom' | 'drag' | 'orbit';

export interface TipContext {
  overview: boolean;
  mode: Mode;
  /** Có ít nhất một món đồ trong phạm vi đang xem. */
  hasItems: boolean;
  /** Đang có hộp thoại mở: không chen gợi ý vào. */
  blocked: boolean;
}

/** Gợi ý hợp với màn hình đang xem và chưa hiện lần nào, hoặc null. */
export function pickTip(c: TipContext, seen: readonly string[]): TipId | null {
  if (c.blocked) return null;
  const want: TipId | null = c.mode === '3d' ? 'orbit' : c.mode === 'plan' && c.overview ? 'zoom' : c.mode === 'plan' && c.hasItems ? 'drag' : null;
  return want && !seen.includes(want) ? want : null;
}

export function tipText(id: TipId): string {
  switch (id) {
    case 'zoom':
      return t('Bấm đúp một phòng để zoom vào thiết kế chi tiết');
    case 'drag':
      return t('Bấm một món để chọn, kéo để di chuyển, bấm R để xoay');
    case 'orbit':
      return t('Kéo chuột để xoay, cuộn để phóng to');
  }
}

export function loadSeen(kv: KV): string[] {
  try {
    const v: unknown = JSON.parse(kv.get(TIPS_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

interface TipEls {
  tip: HTMLElement;
  tipText: HTMLElement;
  tipClose: HTMLButtonElement;
}

/** Khung gợi ý nhanh ở đầu bản vẽ ("💡 Bấm đúp để zoom"): mỗi gợi ý hiện một lần, đóng được, tự ẩn sau ít giây và khi đổi màn hình. */
export class Tips {
  private shown: TipId | null = null;
  private timer = 0;

  constructor(
    private readonly els: TipEls,
    private readonly kv: KV,
  ) {
    els.tipClose.addEventListener('click', () => this.hide());
  }

  /** Gọi mỗi lần màn hình đổi: ẩn gợi ý không còn hợp, hiện gợi ý mới nếu có. */
  update(c: TipContext): void {
    const seen = loadSeen(this.kv);
    const want = pickTip(c, this.shown ? seen.filter((s) => s !== this.shown) : seen);
    if (want === this.shown) return;
    this.hide();
    if (!want) return;
    this.shown = want;
    this.kv.set(TIPS_KEY, JSON.stringify([...new Set([...seen, want])]));
    this.paint();
    this.els.tip.hidden = false;
    this.timer = window.setTimeout(() => this.hide(), TIP_MS);
  }

  /** Đổi ngôn ngữ: viết lại câu đang hiện. */
  paint(): void {
    if (this.shown) this.els.tipText.textContent = tipText(this.shown);
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.shown = null;
    this.els.tip.hidden = true;
    this.els.tipText.textContent = '';
  }
}
