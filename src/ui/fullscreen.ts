/**
 * Toàn màn hình cho cả trình thiết kế, ở mặt bằng, mặt đứng và 3D: khung soạn thảo phủ kín màn hình, vẫn có thanh công cụ,
 * thư viện bên trái và bảng chỉnh sửa bên phải; đầu trang, nhắc sao lưu và chân trang được ẩn (lớp "fs" trên <body>, xem editor.css).
 * Thử toàn màn hình thật của trình duyệt trên cả trang (để thông báo và hộp thoại vẫn hiện); không được (iPhone, khung nhúng)
 * thì chỉ phủ kín cửa sổ bằng CSS. Thoát bằng nút, phím Esc hoặc phím thoát của trình duyệt.
 */
export class Fullscreen {
  private readonly off: (() => void)[] = [];
  private scrollY = 0;

  constructor(
    private readonly btn: HTMLButtonElement,
    private readonly label: HTMLElement,
    private readonly body: HTMLElement = document.body,
  ) {
    const onChange = (): void => {
      // trình duyệt tự thoát toàn màn hình (phím Esc): đồng bộ lại phần phủ kín bằng CSS
      if (!document.fullscreenElement && this.on) this.set(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    this.off.push(() => document.removeEventListener('fullscreenchange', onChange));
  }

  get on(): boolean {
    return this.body.classList.contains('fs');
  }

  toggle(): void {
    this.set(!this.on);
  }

  set(on: boolean): void {
    if (on === this.on) return;
    // ẩn đầu trang làm trang ngắn lại: nhớ chỗ đang cuộn để trả về khi thoát
    if (on) this.scrollY = window.scrollY;
    this.body.classList.toggle('fs', on);
    this.btn.setAttribute('aria-pressed', String(on));
    this.label.textContent = on ? 'Thoát toàn màn hình' : 'Toàn màn hình';
    document.documentElement.style.overflow = on ? 'hidden' : '';
    if (on) {
      try {
        void document.documentElement.requestFullscreen?.()?.catch(() => {});
      } catch {
        /* không bật được toàn màn hình thật: vẫn phủ kín bằng CSS */
      }
    } else {
      if (document.fullscreenElement) {
        try {
          void document.exitFullscreen?.()?.catch(() => {});
        } catch {
          /* bỏ qua */
        }
      }
      if (typeof window.scrollTo === 'function') window.scrollTo(0, this.scrollY);
    }
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off.length = 0;
  }
}
