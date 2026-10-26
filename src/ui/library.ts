import { escapeHtml, plain } from '../core/format';
import { t, tn } from '../i18n';
import type { Registry } from '../core/registry';
import { roomDragId } from '../core/rooms';
import { FLOOR_COLORS } from '../data/palettes';
import { ROOM_TYPE_IDS, ROOMS } from '../data/rooms';
import type { ItemDef } from '../data/schema';
import type { Mode } from '../views/host';

/** Một dòng trong thư viện: món (đồ sàn, đồ tường) hoặc một loại cửa. id là mã đi theo khi bấm hoặc kéo. */
export interface LibItem {
  id: string;
  name: string;
  color: string;
  /** Kích thước ghi dưới tên. */
  size: string;
}

export interface LibGroup {
  id: string;
  title: string;
  items: LibItem[];
}

/**
 * Kiểu xem của thư viện: ba kiểu xem một phòng, "apartment" khi xem mặt bằng cả căn hộ (cùng danh sách với mặt bằng một phòng: đồ sàn, cửa
 * và nhóm Phòng), hoặc "apartment3d" khi xem 3D cả căn hộ (chỉ để xem nên chỉ còn nhóm Phòng).
 */
export type LibMode = Mode | 'apartment' | 'apartment3d';

/** Hai nhóm cửa nằm cuối thư viện ở mọi kiểu xem, vì cửa nằm trên tường và thấy được ở cả mặt bằng, mặt đứng lẫn 3D. */
const OPENING_GROUPS = [
  { id: 'open-door', title: 'Cửa đi', kind: 'door' },
  { id: 'open-win', title: 'Cửa sổ', kind: 'win' },
] as const;

/**
 * Các nhóm hiện trong thư viện theo kiểu xem: mặt bằng có đồ sàn, mặt đứng có đồ gắn tường,
 * 3D có cả hai (đồ tường dùng tên nhóm riêng cho 3D); sau cùng là nhóm cửa đi và cửa sổ ở mọi kiểu xem.
 * query lọc theo tên và tên nhóm, không phân biệt dấu. Chỉ món live mới hiện; thứ tự theo khai báo trong data/.
 */
export function libraryGroups(reg: Registry, mode: LibMode, query: string): LibGroup[] {
  const place = mode === 'plan' || mode === 'apartment' ? 'floor' : mode === 'elev' ? 'wall' : null;
  const q = plain(query.trim());
  const groups: LibGroup[] = [];
  // nhóm Phòng: các loại phòng thêm vào căn hộ. Đứng cuối danh sách; xem 3D cả căn hộ thì là nhóm duy nhất (đồ không đặt được ở đó)
  const roomGroup = (): void => {
    const title = mode === 'apartment3d' ? t('Phòng') : t('Phòng (thêm vào căn hộ)');
    // tìm được cả bằng tên tiếng Việt lẫn tên đang hiện
    const items = ROOM_TYPE_IDS.filter((r) => !q || plain(`${ROOMS[r].name} ${tn(ROOMS[r].name)} ${title}`).includes(q)).map(
      (r): LibItem => ({ id: roomDragId(r), name: tn(ROOMS[r].name), color: FLOOR_COLORS[ROOMS[r].floor]?.hex ?? '#e2c9a4', size: `${ROOMS[r].W} × ${ROOMS[r].H} cm` }),
    );
    if (items.length) groups.push({ id: 'rooms', title, items });
  };
  if (mode === 'apartment3d') {
    roomGroup();
    return groups;
  }
  for (const cat of reg.categories) {
    if (place && cat.place !== place) continue;
    const title = tn(mode === '3d' && cat.place === 'wall' ? (cat.label3d ?? cat.name) : cat.name);
    const items = reg
      .live(cat.place)
      .filter((it) => it.cat === cat.id && (!q || plain(`${it.name} ${tn(it.name)} ${title}`).includes(q)))
      .map((it): LibItem => ({ id: it.id, name: tn(it.name), color: it.color, size: sizeLabel(it) }));
    if (items.length) groups.push({ id: cat.id, title, items });
  }
  for (const g of OPENING_GROUPS) {
    const title = tn(g.title);
    const items = reg.openings
      .filter((p) => p.kind === g.kind && (!q || plain(`${p.name} ${tn(p.name)} ${g.title} ${title}`).includes(q)))
      .map((p): LibItem => ({ id: p.id, name: tn(p.name), color: p.color, size: p.kind === 'door' ? `${p.w} cm` : `${p.w} × ${p.h ?? 120} cm` }));
    if (items.length) groups.push({ id: g.id, title, items });
  }
  roomGroup();
  return groups;
}

/** Kích thước ghi dưới tên món: đồ sàn là rộng × sâu, đồ tường là rộng × cao. */
export function sizeLabel(it: ItemDef): string {
  return `${it.w} × ${it.place === 'wall' ? it.h : it.d} cm`;
}

function itemsHtml(items: readonly LibItem[]): string {
  return items
    .map(
      (it) =>
        `<button class="item" type="button" draggable="true" data-id="${escapeHtml(it.id)}"><span class="sw" style="background:${escapeHtml(it.color)}"></span><span><span class="nm">${escapeHtml(it.name)}</span><span class="sz">${escapeHtml(it.size)}</span></span></button>`,
    )
    .join('');
}

/**
 * Danh sách theo nhóm. Đang tìm kiếm (searching) thì hiện hết các món khớp, nhóm nào cũng mở.
 * Không thì mỗi nhóm là một hàng tiêu đề, chỉ nhóm đang chọn (open) mới hiện danh sách món.
 */
export function libraryHtml(groups: readonly LibGroup[], open: string | null = null, searching = false): string {
  if (!groups.length) return `<p class="empty" style="margin-top:12px">${t('Không có món nào khớp.')}</p>`;
  if (searching) return groups.map((g) => `<div class="cat"><h3>${escapeHtml(g.title)}</h3>${itemsHtml(g.items)}</div>`).join('');
  const rows = groups.map((g) => {
    const on = g.id === open;
    const id = escapeHtml(g.id);
    return (
      `<div class="cat" data-open="${on}">` +
      `<button class="cathead" type="button" data-cat="${id}" aria-expanded="${on}" aria-controls="lib-${id}"><span class="chev" aria-hidden="true"></span><span class="ct">${escapeHtml(g.title)}</span><span class="cn">${g.items.length}</span></button>` +
      `<div class="catitems" id="lib-${id}" role="group" aria-label="${escapeHtml(g.title)}">${on ? itemsHtml(g.items) : ''}</div>` +
      `</div>`
    );
  });
  return `<div class="acc">${rows.join('')}</div>`;
}

/** Gợi ý dưới danh sách. Chưa tìm kiếm thì nhắc chọn nhóm trước, vì các nhóm đang đóng. */
export function libraryHint(mode: LibMode, searching = false): string {
  switch (mode) {
    case 'apartment3d':
      return searching ? t('Bấm hoặc kéo một loại phòng vào mô hình để thêm phòng vào căn hộ. Muốn xóa phòng: bật "Chỉnh bố cục" ở mặt bằng, chọn phòng rồi bấm Delete.') : t('Chọn một nhóm, rồi bấm hoặc kéo một loại phòng vào mô hình để thêm phòng vào căn hộ. Muốn xóa phòng: bật "Chỉnh bố cục" ở mặt bằng, chọn phòng rồi bấm Delete.');
    case 'apartment':
      return searching ? t('Kéo một món thả vào phòng trên mô hình (bấm thì món vào phòng đang chọn). Loại phòng thì thêm phòng mới vào căn hộ.') : t('Chọn một nhóm, rồi kéo một món thả vào phòng trên mô hình (bấm thì món vào phòng đang chọn). Loại phòng thì thêm phòng mới vào căn hộ.');
    case '3d':
      return searching ? t('Bấm để thả vào phòng, hoặc kéo thẳng vào khung 3D. Đồ gắn tường (tủ bếp trên, tivi, tranh...) lên bức tường phía xa hoặc đúng chỗ bạn thả.') : t('Chọn một nhóm, rồi bấm để thả vào phòng, hoặc kéo thẳng vào khung 3D. Đồ gắn tường (tủ bếp trên, tivi, tranh...) lên bức tường phía xa hoặc đúng chỗ bạn thả.');
    case 'elev':
      return searching ? t('Bấm hoặc kéo một món lên bức tường đang xem.') : t('Chọn một nhóm, rồi bấm hoặc kéo một món lên bức tường đang xem.');
    case 'plan':
      return searching ? t('Bấm hoặc kéo một món vào bản vẽ.') : t('Chọn một nhóm, rồi bấm hoặc kéo một món vào bản vẽ.');
    default:
      return '';
  }
}

/** Cột thư viện bên trái: chọn nhóm để xem danh sách, tìm kiếm, bấm để thêm, kéo để thả vào bản vẽ. */
export class Library {
  private mode: LibMode = 'plan';
  /** Nhóm đang mở. Chỉ một nhóm mở tại một lúc; null là đóng hết. */
  private open: string | null = null;

  constructor(
    private readonly els: { library: HTMLElement; q: HTMLInputElement; libHint: HTMLElement },
    private readonly reg: Registry,
    private readonly onPick: (id: string) => void,
  ) {
    els.library.addEventListener('click', (e) => {
      const target = e.target as Element;
      const cat = target.closest<HTMLElement>('.cathead')?.dataset.cat;
      if (cat) {
        this.toggle(cat);
        return;
      }
      const id = target.closest<HTMLElement>('.item')?.dataset.id;
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
  setMode(mode: LibMode): void {
    const from = this.mode;
    this.mode = mode;
    // xem 3D cả căn hộ: nhóm Phòng là nhóm duy nhất, mở sẵn cho thấy ngay các loại phòng; rời đó thì không nhóm nào mở sẵn
    if (mode === 'apartment3d') this.open = 'rooms';
    else if (from === 'apartment3d') this.open = null;
    this.els.q.value = '';
    this.render();
  }

  /** Chọn một nhóm thì mở danh sách của nhóm đó và đóng nhóm đang mở; chọn lại nhóm đang mở thì đóng. */
  toggle(id: string): void {
    this.open = this.open === id ? null : id;
    this.render();
    // vẽ lại làm mất focus và có thể đẩy tiêu đề ra khỏi khung cuộn
    const head = [...this.els.library.querySelectorAll<HTMLElement>('.cathead')].find((h) => h.dataset.cat === id);
    head?.focus({ preventScroll: true });
    head?.scrollIntoView?.({ block: 'nearest' });
  }

  render(): void {
    const q = this.els.q.value;
    const searching = q.trim() !== '';
    this.els.library.innerHTML = libraryHtml(libraryGroups(this.reg, this.mode, q), this.open, searching);
    this.els.libHint.textContent = libraryHint(this.mode, searching);
  }
}
