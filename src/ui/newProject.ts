import { DEFAULT_COUNTS, countOf, countsError, totalArea, totalRooms, type ProjectSpec } from '../core/project';
import { escapeHtml, fm } from '../core/format';
import { LIMITS } from '../core/limits';
import { ROOM_TYPE_IDS, ROOMS, type RoomTypeId } from '../data/rooms';
import { openDialog } from './dialog';
import type { Els } from './els';
import { t, tn } from '../i18n';

type Counts = Record<RoomTypeId, number>;

/** Mỗi loại phòng một hàng: tên, cỡ mặc định và nút − / + chọn số phòng. */
export function newProjectRowsHtml(counts: Counts): string {
  const total = totalRooms(counts);
  return ROOM_TYPE_IDS.map((ty) => {
    const n = counts[ty];
    const name = escapeHtml(tn(ROOMS[ty].name));
    return (
      `<li class="nprow" data-type="${ty}"><span class="npname">${name}<small class="meta">${ROOMS[ty].W} × ${ROOMS[ty].H} cm</small></span>` +
      `<span class="npstep"><button class="btn" type="button" data-step="-1" aria-label="${t('Bớt {name}', { name })}"${n <= 0 ? ' disabled' : ''}>−</button>` +
      `<output aria-live="polite" aria-label="${t('Số {name}', { name })}">${n}</output>` +
      `<button class="btn" type="button" data-step="1" aria-label="${t('Thêm {name}', { name })}"${total >= LIMITS.maxRooms ? ' disabled' : ''}>+</button></span></li>`
    );
  }).join('');
}

/** "4 phòng · 48,4 m²", hoặc lý do chưa tạo được. */
export function newProjectSummary(counts: Counts): { text: string; error: boolean } {
  const err = countsError(counts);
  if (err) return { text: err, error: true };
  return { text: t('{n} phòng · khoảng {area} m² sàn (cỡ mặc định, đổi được sau)', { n: totalRooms(counts), area: fm(totalArea(counts)) }), error: false };
}

export interface NewProjectDeps {
  /** Đã có bản vẽ tự lưu trong trình duyệt: tạo dự án mới sẽ thay thế nó, nên cảnh báo. */
  hasSaved: () => boolean;
  create: (spec: ProjectSpec, name: string) => void;
  /** Bấm "Xuất file trước": app mở hộp thoại Xuất. */
  exportFirst: () => void;
}

type NewEls = Pick<Els, 'dlgNew' | 'npName' | 'npList' | 'npSample' | 'npSummary' | 'npWarn' | 'npExport' | 'npCreate' | 'npCancel'>;

/** Hộp thoại Dự án mới: chọn số phòng mỗi loại, đặt tên, có kèm đồ mẫu hay không. */
export class NewProjectDialog {
  private counts: Counts = { ...DEFAULT_COUNTS };
  /** Lần mở đầu tiên (nút Hủy ghi là "Dùng căn hộ mẫu"). */
  private first = false;

  constructor(
    private readonly els: NewEls,
    private readonly deps: NewProjectDeps,
  ) {
    els.npList.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>('[data-step]');
      const type = b?.closest<HTMLElement>('[data-type]')?.dataset.type as RoomTypeId | undefined;
      if (!b || b.disabled || !type || !(type in this.counts)) return;
      const next = countOf(this.counts, type) + Number(b.dataset.step);
      if (next < 0 || (Number(b.dataset.step) > 0 && totalRooms(this.counts) >= LIMITS.maxRooms)) return;
      this.counts[type] = next;
      this.paint();
      // vẽ lại danh sách làm mất focus: trả lại cho nút vừa bấm
      els.npList.querySelector<HTMLElement>(`[data-type="${type}"] [data-step="${b.dataset.step}"]:not([disabled])`)?.focus();
    });
    els.npCreate.addEventListener('click', () => {
      if (countsError(this.counts)) return;
      els.dlgNew.close();
      deps.create({ counts: { ...this.counts }, sample: els.npSample.checked }, els.npName.value);
    });
    els.npCancel.addEventListener('click', () => els.dlgNew.close());
    els.npExport.addEventListener('click', () => {
      els.dlgNew.close();
      deps.exportFirst();
    });
  }

  /** first: lần mở đầu tiên (chưa có dự án nào), nút Hủy đổi thành "Dùng căn hộ mẫu". */
  open(first = false): void {
    const { els, deps } = this;
    this.first = first;
    this.counts = { ...DEFAULT_COUNTS };
    els.npName.value = '';
    els.npSample.checked = false;
    els.npWarn.hidden = !deps.hasSaved();
    this.paintCancel();
    this.paint();
    openDialog(els.dlgNew);
  }

  /** Đổi ngôn ngữ: vẽ lại phần chữ do code dựng (danh sách phòng, tóm tắt, nút Hủy), kể cả khi hộp thoại đang đóng. */
  languageChanged(): void {
    this.paintCancel();
    this.paint();
  }

  private paintCancel(): void {
    this.els.npCancel.textContent = this.first ? t('Dùng căn hộ mẫu') : t('Hủy');
  }

  private paint(): void {
    const { els } = this;
    els.npList.innerHTML = newProjectRowsHtml(this.counts);
    const s = newProjectSummary(this.counts);
    els.npSummary.textContent = s.text;
    els.npSummary.classList.toggle('errline', s.error);
    els.npCreate.disabled = s.error;
  }
}
