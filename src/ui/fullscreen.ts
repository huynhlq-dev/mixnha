/**
 * 3D toàn màn hình: thử toàn màn hình thật của trình duyệt; không được (iPhone, khung nhúng) thì phủ kín cửa sổ bằng CSS.
 * Thoát bằng nút, phím Esc hoặc phím thoát của trình duyệt.
 */
export class Fullscreen3D {
  private readonly off: (() => void)[] = [];

  constructor(
    private readonly box: HTMLElement,
    private readonly btn: HTMLButtonElement,
  ) {
    const onChange = (): void => {
      // trình duyệt tự thoát toàn màn hình (phím Esc): đồng bộ lại phần phủ kín bằng CSS
      if (!document.fullscreenElement && this.on) this.set(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    this.off.push(() => document.removeEventListener('fullscreenchange', onChange));
  }

  get on(): boolean {
    return this.box.classList.contains('full');
  }

  toggle(): void {
    this.set(!this.on);
  }

  set(on: boolean): void {
    if (on === this.on) return;
    this.box.classList.toggle('full', on);
    this.btn.setAttribute('aria-pressed', String(on));
    this.btn.textContent = on ? 'Thoát toàn màn hình' : 'Toàn màn hình';
    document.documentElement.style.overflow = on ? 'hidden' : '';
    if (on) {
      try {
        void this.box.requestFullscreen?.()?.catch(() => {});
      } catch {
        /* không bật được toàn màn hình thật: vẫn phủ kín bằng CSS */
      }
      this.box.focus();
    } else if (document.fullscreenElement) {
      try {
        void document.exitFullscreen?.()?.catch(() => {});
      } catch {
        /* bỏ qua */
      }
    }
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off.length = 0;
  }
}
