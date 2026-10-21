import '../fonts';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/gallery.css';

import { registry } from '../core/registry';
import { validateData } from '../core/validate';
import { ROOM_IDS, ROOMS } from '../data/rooms';
import { SHAPE_IDS } from '../data/shapes';
import { groupsHtml, issuesHtml, rulerHtml, SCALE, type CardContext } from './cards';
import { ALL_FILTER, galleryGroups, issuesById, summaryText, type GalleryFilter, type PlaceFilter, type StatusFilter } from './model';
import { createThumbs, type Thumbs } from './thumb3d';

function must<T extends Element>(id: string, ctor: { new (): T }): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`gallery.html thiếu phần tử #${id}`);
  if (!(el instanceof ctor)) throw new Error(`#${id} phải là ${ctor.name}`);
  return el;
}

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

/**
 * Trang gallery: mọi món (kể cả "đang làm" và "ngừng dùng") ở cùng một tỉ lệ, kèm trạng thái và các lỗi dữ liệu.
 * Dùng khi thiết kế và đưa đồ mới vào dần: xem món mới đứng cạnh món có sẵn có hợp lý không.
 */
class Gallery {
  private filter: GalleryFilter = { ...ALL_FILTER };
  private scale: number = SCALE.initial;
  private show3d = true;
  /** undefined: chưa thử dựng. null: trình duyệt không dựng được WebGL. */
  private thumbs: Thumbs | null | undefined;
  private token = 0;
  private frame = 0;

  private readonly summary = must('gSummary', HTMLElement);
  private readonly status = must('gStatus', HTMLElement);
  private readonly place = must('gPlace', HTMLElement);
  private readonly query = must('gQuery', HTMLInputElement);
  private readonly range = must('gScale', HTMLInputElement);
  private readonly scaleOut = must('gScaleOut', HTMLElement);
  private readonly ruler = must('gRuler', HTMLElement);
  private readonly check3d = must('g3d', HTMLInputElement);
  private readonly groups = must('gGroups', HTMLElement);
  private readonly foot = must('gFoot', HTMLElement);

  private readonly items = registry.items;
  private readonly issues = validateData(
    registry.items,
    registry.categories,
    ROOM_IDS.map((id) => ROOMS[id]),
    SHAPE_IDS,
  );
  private readonly byItem = issuesById(this.issues, this.items);
  private readonly byId = new Map(this.items.map((it) => [it.id, it]));
  /** Vấn đề không thuộc món nào (phòng, nhóm): hiện riêng một mục. */
  private readonly otherIssues = this.issues.filter((is) => !this.byItem.has(is.where));

  start(): void {
    this.summary.textContent = summaryText(this.items, this.issues);
    this.range.min = String(SCALE.min);
    this.range.max = String(SCALE.max);
    this.range.step = String(SCALE.step);
    this.range.value = String(this.scale);

    this.status.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-status]');
      if (b) this.setFilter({ status: b.dataset.status as StatusFilter });
    });
    this.place.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-place]');
      if (b) this.setFilter({ place: b.dataset.place as PlaceFilter });
    });
    this.query.addEventListener('input', () => this.setFilter({ query: this.query.value }));
    this.range.addEventListener('input', () => {
      this.scale = Number(this.range.value) || SCALE.initial;
      this.schedule();
    });
    this.check3d.addEventListener('change', () => {
      this.show3d = this.check3d.checked;
      this.render();
    });
    // liên kết "Thay bằng ..." trỏ tới món có thể đang bị bộ lọc ẩn: bỏ lọc để món hiện ra
    window.addEventListener('hashchange', () => this.reveal());

    this.render();
    this.reveal();
  }

  private setFilter(patch: Partial<GalleryFilter>): void {
    this.filter = { ...this.filter, ...patch };
    this.render();
  }

  /** Gom nhiều lần kéo thanh tỉ lệ trong một khung hình thành một lần vẽ. */
  private schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  private reveal(): void {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    let el = document.getElementById(id);
    if (!el && id.startsWith('item-')) {
      this.filter = { ...ALL_FILTER };
      this.query.value = '';
      this.render();
      el = document.getElementById(id);
    }
    el?.scrollIntoView({ block: 'center' });
  }

  private context(): CardContext {
    return { scale: this.scale, issues: this.byItem, byId: this.byId, show3d: this.show3d && this.thumbs !== null };
  }

  private render(): void {
    const f = this.filter;
    for (const b of this.status.querySelectorAll<HTMLElement>('[data-status]')) b.setAttribute('aria-pressed', String(b.dataset.status === f.status));
    for (const b of this.place.querySelectorAll<HTMLElement>('[data-place]')) b.setAttribute('aria-pressed', String(b.dataset.place === f.place));
    this.scaleOut.textContent = `1 cm = ${this.scale.toFixed(1).replace('.', ',')} px`;
    this.ruler.innerHTML = rulerHtml(this.scale);

    const other = this.otherIssues.length ? `<section class="ggroup" aria-label="Vấn đề ở phòng và nhóm"><h2>Vấn đề ở phòng và nhóm</h2>${issuesHtml(this.otherIssues, true)}</section>` : '';
    this.groups.innerHTML = other + groupsHtml(galleryGroups(this.items, registry.categories, f), this.context());
    void this.fillThumbs();
  }

  /** Gắn ảnh 3D vào các ô còn trống. Ảnh đã dựng thì gắn ngay; ảnh mới dựng dần để trang không đứng. */
  private async fillThumbs(): Promise<void> {
    const token = ++this.token;
    if (!this.show3d) return;
    if (this.thumbs === undefined) {
      this.thumbs = await createThumbs();
      if (this.thumbs === null) {
        this.foot.textContent += ' Trình duyệt này không dựng được WebGL nên không có ảnh 3D.';
        if (token === this.token) this.render();
        return;
      }
    }
    const thumbs = this.thumbs;
    if (!thumbs || token !== this.token) return;
    const slots = [...this.groups.querySelectorAll<HTMLElement>('.g3d[data-thumb]')];
    for (let i = 0; i < slots.length; i++) {
      if (token !== this.token) return;
      const slot = slots[i]!;
      const def = this.byId.get(slot.dataset.thumb ?? '');
      const url = def ? thumbs.of(def) : null;
      if (url) {
        const img = new Image();
        img.alt = '';
        img.src = url;
        slot.replaceChildren(img);
      } else {
        slot.closest('figure')?.remove();
      }
      if (i % 4 === 3) await nextFrame();
    }
  }
}

new Gallery().start();
