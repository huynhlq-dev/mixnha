import { escapeHtml } from '../core/format';
import type { Registry } from '../core/registry';
import { checkFileSize, parseDesignFile, type ImportedRoom, type ParsedFile, type ParseResult } from '../storage/file';
import { openDialog } from './dialog';
import type { Els } from './els';

export interface ImportDeps {
  registry: Registry;
  /** Người dùng bấm Nhập: thay các phòng đã chọn bằng nội dung trong file. */
  apply: (rooms: ImportedRoom[], file: ParsedFile) => void;
}

type ImportEls = Pick<Els, 'dlgImport' | 'imDrop' | 'imPick' | 'imPasteToggle' | 'imFile' | 'imPaste' | 'imText' | 'imRead' | 'imResult' | 'imApply' | 'imCancel'>;

/** "2026-10-20T10:05:00+07:00" → "20/10/2026 10:05". Giữ đúng giờ ghi trong file. Không đọc được thì trả về null. */
export function formatExportedAt(iso: string | null): string | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : null;
}

/** Phần xem trước của một file hợp lệ: tên, ngày xuất, ghi chú, từng phòng có ô tích, cảnh báo. */
export function previewHtml(f: ParsedFile): string {
  const items = f.rooms.reduce((n, r) => n + r.itemCount, 0);
  const when = formatExportedAt(f.exportedAt);
  const head = `${when ? `Xuất ${when} · ` : ''}${f.rooms.length} phòng · ${items} món`;
  const rows = f.rooms
    .map(
      (r) =>
        `<div class="rrow"><label><input type="checkbox" data-room="${escapeHtml(r.id)}" checked>${escapeHtml(r.entry.name)}</label><span class="meta">${r.layout.W} × ${r.layout.H} · ${r.itemCount} món</span></div>`,
    )
    .join('');
  const warns = f.warnings.length ? `<ul class="warns">${f.warnings.map((w) => `<li>${escapeHtml(w.message)}</li>`).join('')}</ul>` : '';
  return (
    `<div class="okline">File hợp lệ</div>` +
    `<div class="prev"><b>${escapeHtml(f.name || 'Bản thiết kế không tên')}</b><span class="meta">${escapeHtml(head)}</span>` +
    (f.note ? `<span class="meta">"${escapeHtml(f.note)}"</span>` : '') +
    `${rows}</div>${warns}` +
    `<div class="meta">Phòng đã chọn sẽ được thay bằng bản trong file; phòng chưa có trong căn hộ thì được thêm vào. Bạn vẫn Hoàn tác được.</div>`
  );
}

export function errorHtml(e: { title: string; message: string; detail?: string }): string {
  return `<div class="errline">${escapeHtml(e.title)}</div><div>${escapeHtml(e.message)}</div>${e.detail ? `<div class="meta">Chi tiết: ${escapeHtml(e.detail)}</div>` : ''}`;
}

/** Hộp thoại Nhập bản thiết kế: chọn file, kéo thả hoặc dán nội dung; kiểm tra xong mới cho tick phòng và nhập. */
export class ImportDialog {
  private parsed: ParsedFile | null = null;

  constructor(
    private readonly els: ImportEls,
    private readonly deps: ImportDeps,
  ) {
    els.imPick.addEventListener('click', () => this.pick());
    els.imFile.addEventListener('change', () => {
      const f = els.imFile.files?.[0];
      els.imFile.value = '';
      if (f) void this.readFile(f);
    });
    els.imPasteToggle.addEventListener('click', () => this.togglePaste());
    els.imRead.addEventListener('click', () => this.show(parseDesignFile(els.imText.value, deps.registry)));
    els.imCancel.addEventListener('click', () => els.dlgImport.close());
    els.imApply.addEventListener('click', () => (this.parsed ? this.apply() : this.pick()));
    els.imResult.addEventListener('change', (e) => {
      if ((e.target as Element).matches('input[type="checkbox"]')) this.syncApply();
    });

    const drop = els.imDrop;
    drop.addEventListener('dragover', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      drop.classList.add('over');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      drop.classList.remove('over');
      const f = e.dataTransfer?.files?.[0];
      if (f) void this.readFile(f);
    });
  }

  get isOpen(): boolean {
    return this.els.dlgImport.open;
  }

  open(): void {
    const { els } = this;
    this.parsed = null;
    els.imResult.innerHTML = '';
    els.imText.value = '';
    els.imPaste.hidden = true;
    els.imPasteToggle.setAttribute('aria-expanded', 'false');
    els.imApply.disabled = true;
    els.imApply.textContent = 'Nhập';
    openDialog(els.dlgImport);
  }

  /** Mở hộp thoại rồi đọc luôn file này (khi người dùng thả file lên trang). */
  openWith(file: File): void {
    this.open();
    void this.readFile(file);
  }

  /** Thả file ở bất kỳ đâu trên trang cũng mở hộp thoại Nhập, thay vì để trình duyệt mở file JSON thay cho trang. */
  bindPageDrop(): () => void {
    const over = (e: DragEvent): void => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (f && !this.isOpen) this.openWith(f);
    };
    document.addEventListener('dragover', over);
    document.addEventListener('drop', drop);
    return () => {
      document.removeEventListener('dragover', over);
      document.removeEventListener('drop', drop);
    };
  }

  private pick(): void {
    this.els.imFile.click();
  }

  private togglePaste(): void {
    const { els } = this;
    els.imPaste.hidden = !els.imPaste.hidden;
    els.imPasteToggle.setAttribute('aria-expanded', String(!els.imPaste.hidden));
    if (!els.imPaste.hidden) els.imText.focus();
  }

  private async readFile(f: File): Promise<void> {
    const big = checkFileSize(f.size);
    if (big) return this.show(big);
    try {
      this.show(parseDesignFile(await f.text(), this.deps.registry));
    } catch {
      this.show({ ok: false, error: { code: 'invalid', title: 'Không đọc được file này', message: 'Trình duyệt không đọc được file này. Hãy thử chọn lại file, hoặc dùng mục dán nội dung.' } });
    }
  }

  private show(res: ParseResult): void {
    const { els } = this;
    if (res.ok) {
      this.parsed = res.file;
      els.imResult.innerHTML = previewHtml(res.file);
      els.imApply.textContent = '';
      this.syncApply();
    } else {
      this.parsed = null;
      els.imResult.innerHTML = errorHtml(res.error);
      els.imApply.textContent = 'Chọn file khác';
      els.imApply.disabled = false;
    }
  }

  private chosen(): ImportedRoom[] {
    const f = this.parsed;
    if (!f) return [];
    const ids = new Set([...this.els.imResult.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked')].map((c) => c.dataset.room));
    return f.rooms.filter((r) => ids.has(r.id));
  }

  private syncApply(): void {
    const n = this.chosen().length;
    this.els.imApply.disabled = n === 0;
    this.els.imApply.textContent = n === 0 ? 'Chưa chọn phòng nào' : `Nhập ${n} phòng`;
  }

  private apply(): void {
    const f = this.parsed;
    const rooms = this.chosen();
    if (!f || !rooms.length) return;
    this.els.dlgImport.close();
    this.deps.apply(rooms, f);
  }
}

function hasFiles(e: DragEvent): boolean {
  return !!e.dataTransfer && [...(e.dataTransfer.types ?? [])].includes('Files');
}
