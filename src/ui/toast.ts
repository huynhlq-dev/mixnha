/** Thông báo ngắn ở đáy màn hình, tự tắt sau vài giây. Phần tử có role="status" nên trình đọc màn hình cũng đọc lên. */
export class Toast {
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly el: HTMLElement,
    private readonly ms = 5000,
  ) {}

  show(text: string): void {
    clearTimeout(this.timer);
    this.el.textContent = text;
    this.timer = setTimeout(() => {
      this.el.textContent = '';
    }, this.ms);
  }

  dispose(): void {
    clearTimeout(this.timer);
  }
}
