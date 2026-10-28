import { t } from '../i18n';
import type { LibScope } from './library';
import { MOBILE_QUERY } from './mobile';

/**
 * Các bảng ở chế độ tập trung. Bốn nút đầu của thanh trái mỗi nút một bảng; "rooms" là bảng thư viện lọc theo loại phòng,
 * mở từ nút "Thêm phòng vào căn hộ" trong bảng Phòng nên vẫn tính là của nút Phòng.
 */
export type FocusPanel = 'furniture' | 'openings' | 'room' | 'rooms' | 'health' | 'settings';

type Rail = 'furniture' | 'openings' | 'room' | 'health' | 'settings';
type Section = 'lib' | 'room' | 'health' | 'settings';

const PANELS: Record<FocusPanel, { rail: Rail; section: Section; scope?: LibScope }> = {
  furniture: { rail: 'furniture', section: 'lib', scope: 'furniture' },
  openings: { rail: 'openings', section: 'lib', scope: 'openings' },
  room: { rail: 'room', section: 'room' },
  rooms: { rail: 'room', section: 'lib', scope: 'rooms' },
  health: { rail: 'health', section: 'health' },
  settings: { rail: 'settings', section: 'settings' },
};

/**
 * Một phần tử có sẵn được chuyển vào chỗ [data-slot] mới. role: đặt vai trò khác khi ở chỗ mới (null là bỏ vai trò), trả lại khi về chỗ cũ.
 */
export interface Move {
  id: string;
  slot: string;
  role?: string | null;
}

/**
 * Chế độ tập trung dùng lại chính các nút, bảng và khung đã có (không nhân đôi, nên trạng thái và sự kiện đi theo): khi bật thì chuyển vào
 * thanh trên, bảng nổi, thanh trái; khi tắt thì trả về đúng chỗ cũ. Thứ tự ở đây là thứ tự xuất hiện trong từng chỗ chứa.
 */
export const FOCUS_MOVES: readonly Move[] = [
  { id: 'btnNew', slot: 'proj-menu', role: 'menuitem' },
  { id: 'btnImport', slot: 'proj-menu', role: 'menuitem' },
  { id: 'grpHistory', slot: 'top-history' },
  { id: 'btnExport', slot: 'top-export' },
  { id: 'btnTheme', slot: 'top-theme' },
  { id: 'langBox', slot: 'top-lang' },
  { id: 'btnFull', slot: 'top-exit' },
  { id: 'modes', slot: 'view-modes' },
  { id: 'btnSnap', slot: 'view-toggles' },
  { id: 'btnDim', slot: 'view-toggles' },
  { id: 'btnDetail', slot: 'view-toggles' },
  { id: 'stageHead', slot: 'canvas-head' },
  { id: 'wallsRow', slot: 'canvas-tools' },
  { id: 'aptActs', slot: 'canvas-tools' },
  { id: 'zoombar', slot: 'corner' },
  { id: 'tip', slot: 'tip' },
  { id: 'status', slot: 'status' },
  { id: 'lib', slot: 'lib' },
  { id: 'rooms', slot: 'room-tabs' },
  { id: 'aptInfo', slot: 'room-apt' },
  { id: 'roomSec', slot: 'room-sec' },
  { id: 'healthBox', slot: 'health-box' },
  { id: 'legend', slot: 'health-legend' },
  { id: 'btnReset', slot: 'settings-actions', role: null },
  { id: 'btnClear', slot: 'settings-actions', role: null },
  { id: 'keysList', slot: 'settings-keys' },
  { id: 'infoText', slot: 'settings-info' },
];

interface Moved {
  el: HTMLElement;
  /** Dấu giữ chỗ cũ: nằm đúng vị trí của phần tử trước khi chuyển. */
  mark: Comment;
  role: string | null | undefined;
}

export interface FocusHooks {
  /** Lọc thư viện theo phạm vi của bảng đang mở (null: bỏ lọc, như bố cục thường). */
  setScope(scope: LibScope | null): void;
}

/**
 * Chế độ tập trung: toàn màn hình trên máy tính dựng lại giao diện cho khung vẽ rộng nhất. Thanh trên (dự án, hoàn tác, chụp ảnh, xuất file),
 * thanh trái (mỗi nút mở một bảng thư viện hoặc cài đặt), một thẻ nổi bên phải (kiểu xem, hiển thị, thuộc tính món đang chọn).
 * Điện thoại và máy tính bảng dọc giữ bố cục toàn màn hình cũ. Lớp "focus" trên <body> bật phần CSS (focus.css).
 */
export class FocusLayout {
  private readonly mq: MediaQueryList | null = typeof matchMedia === 'function' ? matchMedia(MOBILE_QUERY) : null;
  private readonly off: (() => void)[] = [];
  private readonly moved: Moved[] = [];
  private readonly rail: HTMLElement;
  private readonly fly: HTMLElement;
  private readonly flyTitle: HTMLElement;
  private readonly editor: HTMLElement;
  private fullscreen = false;
  private applied = false;
  private current: FocusPanel | null = null;

  constructor(
    private readonly hooks: FocusHooks,
    private readonly doc: Document = document,
    private readonly body: HTMLElement = doc.body,
  ) {
    const need = (id: string): HTMLElement => {
      const el = doc.getElementById(id);
      if (!el) throw new Error(`index.html thiếu phần tử #${id}`);
      return el;
    };
    this.rail = need('fsRail');
    this.fly = need('fsFly');
    this.flyTitle = need('fsFlyTitle');
    this.editor = need('editor');

    this.listen(this.rail, 'click', (e) => {
      const p = (e.target as Element).closest<HTMLElement>('[data-rail]')?.dataset.rail as FocusPanel | undefined;
      if (p) this.toggle(p);
    });
    this.listen(need('fsFlyClose'), 'click', () => this.close());
    this.listen(need('btnAddRoom'), 'click', () => this.open('rooms'));
    if (this.mq) {
      const onChange = (): void => this.sync();
      this.mq.addEventListener?.('change', onChange);
      this.off.push(() => this.mq?.removeEventListener?.('change', onChange));
    }
  }

  private listen(el: HTMLElement, type: string, fn: (e: Event) => void): void {
    el.addEventListener(type, fn);
    this.off.push(() => el.removeEventListener(type, fn));
  }

  /** Đang dùng bố cục tập trung (toàn màn hình và không phải màn hình nhỏ). */
  get active(): boolean {
    return this.applied;
  }

  /** Bảng đang mở, hoặc null. */
  get panel(): FocusPanel | null {
    return this.current;
  }

  /** Toàn màn hình vừa bật hoặc tắt (từ Fullscreen.onChange). */
  setFullscreen(on: boolean): void {
    this.fullscreen = on;
    this.sync();
  }

  private sync(): void {
    const want = this.fullscreen && !this.mq?.matches;
    if (want === this.applied) return;
    this.applied = want;
    if (want) this.enter();
    else this.leave();
  }

  private enter(): void {
    const active = this.doc.activeElement as HTMLElement | null;
    for (const m of FOCUS_MOVES) {
      const el = this.doc.getElementById(m.id);
      const slot = this.doc.querySelector(`[data-slot="${m.slot}"]`);
      if (!el || !slot) continue;
      const mark = this.doc.createComment(`focus:${m.id}`);
      const role = m.role === undefined ? undefined : el.getAttribute('role');
      el.replaceWith(mark);
      slot.append(el);
      if (m.role === null) el.removeAttribute('role');
      else if (m.role) el.setAttribute('role', m.role);
      this.moved.push({ el, mark, role });
    }
    this.body.classList.add('focus');
    this.keepFocus(active, this.moved);
  }

  private leave(): void {
    const active = this.doc.activeElement as HTMLElement | null;
    this.close();
    this.hooks.setScope(null);
    // menu dự án đang mở thì đóng, để lần bật sau không mở sẵn
    const menu = this.doc.getElementById('projMenu');
    if (menu) menu.hidden = true;
    this.doc.getElementById('btnProj')?.setAttribute('aria-expanded', 'false');
    const moved = this.moved.splice(0).reverse();
    for (const { el, mark, role } of moved) {
      mark.replaceWith(el);
      if (role === null) el.removeAttribute('role');
      else if (role !== undefined) el.setAttribute('role', role);
    }
    this.body.classList.remove('focus');
    this.keepFocus(active, moved);
  }

  /** Chuyển phần tử khỏi chỗ cũ làm nó mất focus (nút vừa bấm, ô đang nhập): trả focus lại để bàn phím không phải bắt đầu lại. */
  private keepFocus(active: HTMLElement | null, moved: readonly Moved[]): void {
    if (active && active !== this.doc.body && moved.some((m) => m.el === active || m.el.contains(active))) active.focus({ preventScroll: true });
  }

  /** Bấm một nút ở thanh trái: mở bảng của nút đó, bấm lại thì đóng. Đang ở bảng "Thêm phòng" thì bấm nút Phòng quay về bảng Phòng. */
  toggle(panel: FocusPanel): void {
    if (this.current === panel) this.close();
    else this.open(panel);
  }

  open(panel: FocusPanel): void {
    if (!this.applied) return;
    const spec = PANELS[panel];
    this.current = panel;
    if (spec.section === 'lib') this.hooks.setScope(spec.scope ?? null);
    for (const s of this.fly.querySelectorAll<HTMLElement>('[data-panel]')) s.hidden = s.dataset.panel !== spec.section;
    for (const b of this.rail.querySelectorAll<HTMLElement>('[data-rail]')) b.setAttribute('aria-expanded', String(b.dataset.rail === spec.rail));
    this.fly.hidden = false;
    this.editor.setAttribute('data-fly', '');
    this.paintTitle();
  }

  /** Đóng bảng đang mở. Trả về true nếu có bảng để đóng (để phím Esc biết đã xử lý). */
  close(): boolean {
    if (!this.current) return false;
    this.current = null;
    this.fly.hidden = true;
    this.editor.removeAttribute('data-fly');
    for (const b of this.rail.querySelectorAll<HTMLElement>('[data-rail]')) b.setAttribute('aria-expanded', 'false');
    return true;
  }

  /** Tiêu đề bảng: tên nút ở thanh trái (đã dịch cùng giao diện), riêng bảng thêm phòng có tiêu đề riêng. */
  private paintTitle(): void {
    const p = this.current;
    if (!p) return;
    this.flyTitle.textContent = p === 'rooms' ? t('Thêm phòng vào căn hộ') : (this.rail.querySelector(`[data-rail="${PANELS[p].rail}"] span`)?.textContent ?? '');
  }

  /** Đã đổi ngôn ngữ: viết lại tiêu đề bảng đang mở. */
  languageChanged(): void {
    this.paintTitle();
  }

  dispose(): void {
    if (this.applied) {
      this.fullscreen = false;
      this.sync();
    }
    for (const f of this.off) f();
    this.off.length = 0;
  }
}
