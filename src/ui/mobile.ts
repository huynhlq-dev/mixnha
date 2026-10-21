import type { Els } from './els';

/** Điện thoại và máy tính bảng dọc: dưới mức này thư viện là ngăn kéo từ đáy màn hình. Cùng giá trị với @media trong CSS. */
export const MOBILE_QUERY = '(max-width: 1020px)';

export interface MobileApp {
  rotateBy(delta: number): void;
  duplicate(): void;
  removeSelected(): void;
}

type MobileEls = Pick<Els, 'lib' | 'libClose' | 'mAdd' | 'mbar' | 'mRotL' | 'mRotR' | 'mDup' | 'mDel'>;

/** Giao diện cho màn hình nhỏ: ngăn thư viện mở từ nút Thêm đồ, thanh thao tác nhanh ở đáy màn hình. */
export class MobileUi {
  private readonly mq: MediaQueryList | null = typeof matchMedia === 'function' ? matchMedia(MOBILE_QUERY) : null;
  private readonly off: (() => void)[] = [];

  constructor(
    private readonly els: MobileEls,
    app: MobileApp,
    editor: HTMLElement,
  ) {
    els.mAdd.addEventListener('click', () => this.setLib(!this.libOpen));
    els.libClose.addEventListener('click', () => this.setLib(false));
    els.mRotL.addEventListener('click', () => app.rotateBy(-90));
    els.mRotR.addEventListener('click', () => app.rotateBy(90));
    els.mDup.addEventListener('click', () => app.duplicate());
    els.mDel.addEventListener('click', () => app.removeSelected());

    if (this.mq) {
      const onChange = (): void => {
        if (!this.mq?.matches) this.setLib(false);
      };
      this.mq.addEventListener?.('change', onChange);
      this.off.push(() => this.mq?.removeEventListener?.('change', onChange));
    }
    // thanh thao tác nhanh chỉ hiện khi khung thiết kế đang nằm trong màn hình
    if (typeof IntersectionObserver === 'function') {
      const io = new IntersectionObserver((es) => els.mbar.classList.toggle('on', es[es.length - 1]!.isIntersecting));
      io.observe(editor);
      this.off.push(() => io.disconnect());
    } else {
      els.mbar.classList.add('on');
    }
  }

  get isMobile(): boolean {
    return !!this.mq?.matches;
  }

  get libOpen(): boolean {
    return this.els.lib.classList.contains('open');
  }

  setLib(open: boolean): void {
    this.els.lib.classList.toggle('open', open);
    this.els.mAdd.setAttribute('aria-expanded', String(open));
  }

  /** Vừa chọn xong một món trong thư viện: trên điện thoại thì đóng ngăn kéo để thấy bản vẽ. */
  afterPick(): void {
    if (this.isMobile) this.setLib(false);
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off.length = 0;
  }
}
