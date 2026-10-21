import { escapeHtml, plain } from '../core/format';
import type { Registry } from '../core/registry';
import type { ItemDef } from '../data/schema';
import type { Mode } from '../views/host';

export interface LibGroup {
  id: string;
  title: string;
  items: ItemDef[];
}

/**
 * Các nhóm đồ hiện trong thư viện theo kiểu xem: mặt bằng chỉ có đồ sàn, mặt đứng chỉ có đồ gắn tường,
 * 3D có cả hai (đồ tường dùng tên nhóm riêng cho 3D). query lọc theo tên món và tên nhóm, không phân biệt dấu.
 * Chỉ món live mới hiện; thứ tự nhóm và thứ tự món theo khai báo trong data/.
 */
export function libraryGroups(reg: Registry, mode: Mode, query: string): LibGroup[] {
  const place = mode === 'plan' ? 'floor' : mode === 'elev' ? 'wall' : null;
  const q = plain(query.trim());
  const groups: LibGroup[] = [];
  for (const cat of reg.categories) {
    if (place && cat.place !== place) continue;
    const title = mode === '3d' && cat.place === 'wall' ? (cat.label3d ?? cat.name) : cat.name;
    const items = reg.live(cat.place).filter((it) => it.cat === cat.id && (!q || plain(`${it.name} ${title}`).includes(q)));
    if (items.length) groups.push({ id: cat.id, title, items });
  }
  return groups;
}

/** Kích thước ghi dưới tên món: đồ sàn là rộng × sâu, đồ tường là rộng × cao. */
export function sizeLabel(it: ItemDef): string {
  return `${it.w} × ${it.place === 'wall' ? it.h : it.d} cm`;
}

export function libraryHtml(groups: readonly LibGroup[]): string {
  if (!groups.length) return '<p class="empty" style="margin-top:12px">Không có món nào khớp.</p>';
  return groups
    .map(
      (g) =>
        `<div class="cat"><h3>${escapeHtml(g.title)}</h3>${g.items
          .map(
            (it) =>
              `<button class="item" type="button" draggable="true" data-id="${escapeHtml(it.id)}"><span class="sw" style="background:${escapeHtml(it.color)}"></span><span><span class="nm">${escapeHtml(it.name)}</span><span class="sz">${sizeLabel(it)}</span></span></button>`,
          )
          .join('')}</div>`,
    )
    .join('');
}

export function libraryHint(mode: Mode): string {
  if (mode === '3d') return 'Bấm để thả vào phòng, hoặc kéo thẳng vào khung 3D. Đồ gắn tường (tủ bếp trên, tivi, tranh...) lên bức tường phía xa hoặc đúng chỗ bạn thả.';
  if (mode === 'elev') return 'Bấm hoặc kéo một món lên bức tường đang xem.';
  return 'Bấm hoặc kéo một món vào bản vẽ.';
}

/** Cột thư viện bên trái: vẽ danh sách, tìm kiếm, bấm để thêm, kéo để thả vào bản vẽ. */
export class Library {
  private mode: Mode = 'plan';

  constructor(
    private readonly els: { library: HTMLElement; q: HTMLInputElement; libHint: HTMLElement },
    private readonly reg: Registry,
    private readonly onPick: (id: string) => void,
  ) {
    els.library.addEventListener('click', (e) => {
      const id = (e.target as Element).closest<HTMLElement>('.item')?.dataset.id;
      if (id) this.onPick(id);
    });
    els.library.addEventListener('dragstart', (e) => {
      const id = (e.target as Element).closest<HTMLElement>('.item')?.dataset.id;
      if (!id || !e.dataTransfer) return;
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.effectAllowed = 'copy';
    });
    els.q.addEventListener('input', () => this.render());
  }

  /** Đổi kiểu xem: xóa ô tìm kiếm và vẽ lại, vì mỗi kiểu có danh sách riêng. */
  setMode(mode: Mode): void {
    this.mode = mode;
    this.els.q.value = '';
    this.render();
  }

  render(): void {
    this.els.library.innerHTML = libraryHtml(libraryGroups(this.reg, this.mode, this.els.q.value));
    this.els.libHint.textContent = libraryHint(this.mode);
  }
}
