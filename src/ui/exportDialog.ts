import { escapeHtml } from '../core/format';
import type { Layouts } from '../core/types';
import { ROOM_IDS, ROOMS, type RoomId } from '../data/rooms';
import { buildFile, byteLength, makeFilename, serializeFile, summarizeExport, type ExportScope } from '../storage/file';
import { copyText, downloadText, openDialog } from './dialog';
import type { Els } from './els';

export interface ExportMeta {
  name: string;
  note: string;
}

export interface ExportDeps {
  layouts: () => Layouts;
  room: () => RoomId;
  meta: () => ExportMeta;
  setMeta: (m: ExportMeta) => void;
  now: () => Date;
  /** Đã xuất xong (tải hoặc chép): app ghi nhận để tính lại bộ đếm nhắc sao lưu. */
  onExported: () => void;
  notice: (text: string) => void;
  /** Thay được trong kiểm thử. */
  download?: (filename: string, text: string) => void;
  copy?: (text: string) => Promise<boolean>;
}

type ExportEls = Pick<Els, 'dlgExport' | 'exName' | 'exNote' | 'exScopeAll' | 'exScopeRoom' | 'exSummary' | 'exDone' | 'exDownload' | 'exCopy' | 'exClose'>;

/** "4 phòng · 31 món · khoảng 14 KB" */
export function exportSummary(rooms: number, items: number, bytes: number): string {
  return `${rooms} phòng · ${items} món · khoảng ${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Hộp thoại Xuất bản thiết kế: đặt tên, ghi chú, chọn phạm vi, rồi tải file hoặc sao chép nội dung. */
export class ExportDialog {
  constructor(
    private readonly els: ExportEls,
    private readonly deps: ExportDeps,
  ) {
    const refresh = (): void => this.update();
    els.exName.addEventListener('input', refresh);
    els.exNote.addEventListener('input', refresh);
    els.dlgExport.addEventListener('change', (e) => {
      if ((e.target as Element).getAttribute('name') === 'exScope') refresh();
    });
    els.exDownload.addEventListener('click', () => this.download());
    els.exCopy.addEventListener('click', () => void this.copy());
    els.exClose.addEventListener('click', () => els.dlgExport.close());
  }

  open(): void {
    const { els, deps } = this;
    const m = deps.meta();
    els.exName.value = m.name;
    els.exNote.value = m.note;
    els.exScopeAll.textContent = `Cả ${ROOM_IDS.length} phòng`;
    els.exScopeRoom.textContent = `Chỉ phòng đang mở: ${ROOMS[deps.room()].name}`;
    this.radio('all').checked = true;
    this.say('', false);
    this.update();
    openDialog(els.dlgExport);
    els.exName.focus();
  }

  private radio(v: ExportScope): HTMLInputElement {
    return this.els.dlgExport.querySelector<HTMLInputElement>(`input[name="exScope"][value="${v}"]`)!;
  }

  private scope(): ExportScope {
    return this.radio('room').checked ? 'room' : 'all';
  }

  private say(text: string, bad: boolean): void {
    this.els.exDone.hidden = !text;
    this.els.exDone.textContent = text;
    this.els.exDone.className = bad ? 'errline' : 'okline';
  }

  private build(): { text: string; filename: string } {
    const { els, deps } = this;
    const now = deps.now();
    const name = els.exName.value;
    const file = buildFile(deps.layouts(), { scope: this.scope(), room: deps.room(), name, note: els.exNote.value, now });
    return { text: serializeFile(file), filename: makeFilename(file.name, now) };
  }

  private update(): void {
    const { text, filename } = this.build();
    const s = summarizeExport(this.deps.layouts(), this.scope(), this.deps.room());
    this.els.exSummary.innerHTML = `${escapeHtml(exportSummary(s.rooms, s.items, byteLength(text)))}<br>${escapeHtml(filename)}`;
  }

  private remember(): void {
    this.deps.setMeta({ name: this.els.exName.value.trim(), note: this.els.exNote.value.trim() });
  }

  private download(): void {
    const { text, filename } = this.build();
    (this.deps.download ?? downloadText)(filename, text);
    this.remember();
    this.deps.onExported();
    this.els.dlgExport.close();
    this.deps.notice(`Đã tải xuống ${filename}`);
  }

  private async copy(): Promise<void> {
    const { text } = this.build();
    const ok = await (this.deps.copy ?? copyText)(text);
    if (!ok) {
      this.say('Trình duyệt không cho sao chép. Hãy dùng nút Tải file .json.', true);
      return;
    }
    this.remember();
    this.deps.onExported();
    this.say('Đã sao chép. Dán vào tin nhắn hoặc email để gửi, người nhận dùng Nhập file, mục dán nội dung.', false);
  }
}
