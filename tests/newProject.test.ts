import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LIMITS } from '../src/core/limits';
import { newProjectRowsHtml, newProjectSummary, NewProjectDialog } from '../src/ui/newProject';

const counts = (over: Partial<Record<'ngu' | 'khach' | 'bep' | 'wc' | 'lamviec' | 'trong' | 'banchong', number>> = {}) => ({ ngu: 1, khach: 1, bep: 1, wc: 1, lamviec: 0, trong: 0, banchong: 0, ...over });

describe('hàng chọn số phòng', () => {
  it('mỗi loại một hàng, ghi số hiện tại và cỡ mặc định', () => {
    const html = newProjectRowsHtml(counts({ ngu: 2 }));
    expect((html.match(/class="nprow"/g) ?? []).length).toBe(7);
    expect(html).toContain('data-type="banchong"');
    expect(html).toContain('data-type="ngu"');
    expect(html).toMatch(/Số Phòng ngủ">2</);
    expect(html).toContain('400 × 350 cm');
  });

  it('nút − tắt khi số là 0; mọi nút + tắt khi đã đủ số phòng tối đa', () => {
    const html = newProjectRowsHtml(counts());
    const row = (t: string) => html.slice(html.indexOf(`data-type="${t}"`), html.indexOf('</li>', html.indexOf(`data-type="${t}"`)));
    expect(row('lamviec')).toContain('data-step="-1" aria-label="Bớt Phòng làm việc" disabled');
    expect(row('ngu')).not.toContain('data-step="-1" aria-label="Bớt Phòng ngủ" disabled');
    expect(row('ngu')).not.toContain('Thêm Phòng ngủ" disabled');
    const full = newProjectRowsHtml(counts({ ngu: LIMITS.maxRooms - 3 }));
    expect((full.match(/data-step="1"[^>]* disabled/g) ?? []).length).toBe(7);
  });

  it('tóm tắt: số phòng và diện tích; hoặc lý do chưa tạo được', () => {
    expect(newProjectSummary(counts())).toEqual({ text: expect.stringContaining('4 phòng'), error: false });
    expect(newProjectSummary(counts()).text).toContain('48,4 m²');
    expect(newProjectSummary(counts({ ngu: 0, khach: 0, bep: 0, wc: 0 }))).toEqual({ text: expect.stringContaining('ít nhất một phòng'), error: true });
    expect(newProjectSummary(counts({ ngu: 20 })).error).toBe(true);
  });
});

describe('hộp thoại Dự án mới', () => {
  const make = (saved = false) => {
    const el = <T extends HTMLElement>(tag: string, id: string): T => {
      const e = document.createElement(tag) as T;
      e.id = id;
      return e;
    };
    const dlg = el<HTMLDialogElement>('dialog', 'dlgNew');
    // happy-dom có thể chưa có showModal/close: thay bằng bản đơn giản
    dlg.showModal = () => dlg.setAttribute('open', '');
    dlg.close = () => dlg.removeAttribute('open');
    const els = {
      dlgNew: dlg,
      npName: el<HTMLInputElement>('input', 'npName'),
      npList: el<HTMLElement>('ul', 'npList'),
      npSample: Object.assign(el<HTMLInputElement>('input', 'npSample'), { type: 'checkbox' }),
      npSummary: el<HTMLElement>('div', 'npSummary'),
      npWarn: el<HTMLElement>('div', 'npWarn'),
      npExport: el<HTMLButtonElement>('button', 'npExport'),
      npCreate: el<HTMLButtonElement>('button', 'npCreate'),
      npCancel: el<HTMLButtonElement>('button', 'npCancel'),
    };
    document.body.append(dlg);
    const deps = { hasSaved: vi.fn(() => saved), create: vi.fn(), exportFirst: vi.fn() };
    const d = new NewProjectDialog(els, deps);
    const step = (type: string, delta: number) => els.npList.querySelector<HTMLButtonElement>(`[data-type="${type}"] [data-step="${delta}"]`)!.click();
    const value = (type: string) => els.npList.querySelector(`[data-type="${type}"] output`)!.textContent;
    return { d, els, deps, step, value };
  };

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('mở ra với căn hộ mặc định (1 ngủ, 1 khách, 1 bếp, 1 vệ sinh), có thể tạo ngay', () => {
    const { d, els, value } = make();
    d.open();
    expect(els.dlgNew.hasAttribute('open')).toBe(true);
    expect(['ngu', 'khach', 'bep', 'wc', 'lamviec', 'trong', 'banchong'].map(value)).toEqual(['1', '1', '1', '1', '0', '0', '0']);
    expect(els.npSummary.textContent).toContain('4 phòng');
    expect(els.npCreate.disabled).toBe(false);
    expect(els.npName.value).toBe('');
    expect(els.npSample.checked).toBe(false);
  });

  it('cảnh báo thay thế chỉ hiện khi đã có bản vẽ tự lưu; lần mở đầu thì nút Hủy là "Dùng căn hộ mẫu"', () => {
    const a = make(false);
    a.d.open(true);
    expect(a.els.npWarn.hidden).toBe(true);
    expect(a.els.npCancel.textContent).toBe('Dùng căn hộ mẫu');
    document.body.innerHTML = '';
    const b = make(true);
    b.d.open();
    expect(b.els.npWarn.hidden).toBe(false);
    expect(b.els.npCancel.textContent).toBe('Hủy');
  });

  it('bấm + và − đổi số lượng, tóm tắt đổi theo', () => {
    const { d, els, step, value } = make();
    d.open();
    step('ngu', 1);
    step('lamviec', 1);
    step('bep', -1);
    expect(['ngu', 'bep', 'lamviec'].map(value)).toEqual(['2', '0', '1']);
    expect(els.npSummary.textContent).toContain('5 phòng');
  });

  it('không vượt quá số phòng tối đa, không xuống dưới 0', () => {
    const { d, els, step, value } = make();
    d.open();
    for (let i = 0; i < 30; i++) {
      const b = els.npList.querySelector<HTMLButtonElement>('[data-type="trong"] [data-step="1"]')!;
      if (b.disabled) break;
      b.click();
    }
    expect(Number(value('trong')) + 4).toBe(LIMITS.maxRooms);
    // bấm tiếp nút + đã tắt thì không thêm
    step('trong', 1);
    expect(Number(value('trong')) + 4).toBe(LIMITS.maxRooms);
    step('lamviec', -1);
    expect(value('lamviec')).toBe('0');
  });

  it('bỏ hết phòng thì báo lỗi và không tạo được', () => {
    const { d, els, step, deps } = make();
    d.open();
    for (const t of ['ngu', 'khach', 'bep', 'wc']) step(t, -1);
    expect(els.npCreate.disabled).toBe(true);
    expect(els.npSummary.classList.contains('errline')).toBe(true);
    els.npCreate.click();
    expect(deps.create).not.toHaveBeenCalled();
  });

  it('Tạo dự án: đóng hộp thoại và gọi create với số lượng, có kèm đồ mẫu hay không, tên dự án', () => {
    const { d, els, step, deps } = make();
    d.open();
    step('ngu', 1);
    step('wc', -1);
    els.npSample.checked = true;
    els.npName.value = 'Nhà mới';
    els.npCreate.click();
    expect(els.dlgNew.hasAttribute('open')).toBe(false);
    expect(deps.create).toHaveBeenCalledExactlyOnceWith({ counts: { ngu: 2, khach: 1, bep: 1, wc: 0, lamviec: 0, trong: 0, banchong: 0 }, sample: true }, 'Nhà mới');
  });

  it('mở lại thì về mặc định, không nhớ lần trước', () => {
    const { d, els, step, value } = make();
    d.open();
    step('ngu', 1);
    els.npName.value = 'x';
    d.open();
    expect(value('ngu')).toBe('1');
    expect(els.npName.value).toBe('');
  });

  it('Xuất file trước: đóng hộp thoại và gọi exportFirst; Hủy chỉ đóng', () => {
    const { d, els, deps } = make(true);
    d.open();
    els.npExport.click();
    expect(deps.exportFirst).toHaveBeenCalledTimes(1);
    expect(els.dlgNew.hasAttribute('open')).toBe(false);
    d.open();
    els.npCancel.click();
    expect(els.dlgNew.hasAttribute('open')).toBe(false);
    expect(deps.create).not.toHaveBeenCalled();
  });
});
