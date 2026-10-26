import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyItem, freshLayout, pasteItem, findItem } from '../src/core/layout';
import { registry } from '../src/core/registry';
import { roomGeo } from '../src/core/room';
import { ROOMS } from '../src/data/rooms';
import { setLang } from '../src/i18n';
import { memoryKV } from '../src/storage/kv';
import { bindMenu } from '../src/ui/menu';
import { roomTabsHtml } from '../src/ui/nav';
import { loadSeen, pickTip, TIP_MS, Tips, TIPS_KEY, tipText, type TipContext } from '../src/ui/tips';
import { renderElevation } from '../src/views/elevation';
import { renderPlan } from '../src/views/plan';

afterEach(() => {
  setLang('vi');
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('menu "Khác" và bảng phím tắt', () => {
  function setup() {
    document.body.innerHTML = '<div id="w"><button id="b">Khác</button><div id="m" hidden><button role="menuitem" id="i1">A</button><button role="menuitem" id="i2">B</button><button role="menuitem" id="i3" disabled>C</button></div></div><button id="out">ngoài</button>';
    const btn = document.getElementById('b') as HTMLButtonElement;
    const menu = document.getElementById('m')!;
    return { btn, menu, handle: bindMenu(btn, menu), i1: document.getElementById('i1') as HTMLButtonElement, i2: document.getElementById('i2') as HTMLButtonElement, out: document.getElementById('out')! };
  }

  it('bấm nút mở rồi đóng, aria-expanded khớp', () => {
    const { btn, menu, handle } = setup();
    expect(btn.getAttribute('aria-expanded')).toBeNull();
    btn.click();
    expect(menu.hidden).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(handle.isOpen).toBe(true);
    btn.click();
    expect(menu.hidden).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('bấm ra ngoài hoặc bấm một mục thì đóng; bấm trong menu nhưng không phải mục thì giữ', () => {
    const { btn, menu, out, i1 } = setup();
    btn.click();
    menu.click();
    expect(menu.hidden).toBe(false);
    out.click();
    expect(menu.hidden).toBe(true);
    btn.click();
    i1.click();
    expect(menu.hidden).toBe(true);
  });

  it('Esc đóng, trả focus về nút và chặn phím tắt chung; mũi tên đi qua các mục (bỏ mục bị tắt)', () => {
    const { btn, menu, i1, i2 } = setup();
    btn.focus();
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(menu.hidden).toBe(false);
    expect(document.activeElement).toBe(i1);
    i1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(i2);
    i2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(i1);
    i1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(i2);
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    i2.dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(btn);
  });

  it('Tab ra ngoài thì đóng', () => {
    const { btn, menu, i1, out } = setup();
    btn.click();
    i1.focus();
    i1.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: out }));
    expect(menu.hidden).toBe(true);
  });
});

describe('gợi ý nhanh', () => {
  const ctx = (over: Partial<TipContext> = {}): TipContext => ({ overview: true, mode: 'plan', hasItems: true, blocked: false, ...over });

  it('chọn gợi ý hợp màn hình, bỏ qua cái đã hiện, không chen vào hộp thoại', () => {
    expect(pickTip(ctx(), [])).toBe('zoom');
    expect(pickTip(ctx(), ['zoom'])).toBeNull();
    expect(pickTip(ctx({ overview: false }), [])).toBe('drag');
    expect(pickTip(ctx({ overview: false, hasItems: false }), [])).toBeNull();
    expect(pickTip(ctx({ mode: '3d' }), [])).toBe('orbit');
    expect(pickTip(ctx({ mode: 'elev', overview: false }), [])).toBeNull();
    expect(pickTip(ctx({ blocked: true }), [])).toBeNull();
  });

  it('câu gợi ý theo ngôn ngữ', () => {
    expect(tipText('zoom')).toBe('Bấm đúp một phòng để zoom vào thiết kế chi tiết');
    setLang('en');
    expect(tipText('zoom')).toBe('Double-click a room to zoom into its detailed design');
    expect(tipText('orbit')).toBe('Drag to rotate, scroll to zoom');
  });

  it('đọc danh sách đã hiện từ kho, bỏ giá trị hỏng', () => {
    expect(loadSeen(memoryKV())).toEqual([]);
    expect(loadSeen(memoryKV({ [TIPS_KEY]: '["zoom",3]' }))).toEqual(['zoom']);
    expect(loadSeen(memoryKV({ [TIPS_KEY]: 'không phải json' }))).toEqual([]);
    expect(loadSeen(memoryKV({ [TIPS_KEY]: '{"a":1}' }))).toEqual([]);
  });

  function mount(kv = memoryKV()) {
    document.body.innerHTML = '<div id="tip" hidden><span id="tipText"></span><button id="tipClose"></button></div>';
    const els = { tip: document.getElementById('tip')!, tipText: document.getElementById('tipText')!, tipClose: document.getElementById('tipClose') as HTMLButtonElement };
    return { kv, els, tips: new Tips(els, kv) };
  }

  it('hiện một lần, nhớ đã hiện, đóng được và không hiện lại', () => {
    const { kv, els, tips } = mount();
    tips.update({ overview: true, mode: 'plan', hasItems: true, blocked: false });
    expect(els.tip.hidden).toBe(false);
    expect(els.tipText.textContent).toBe('Bấm đúp một phòng để zoom vào thiết kế chi tiết');
    expect(loadSeen(kv)).toEqual(['zoom']);
    // cùng màn hình: giữ nguyên
    tips.update({ overview: true, mode: 'plan', hasItems: true, blocked: false });
    expect(els.tip.hidden).toBe(false);
    els.tipClose.click();
    expect(els.tip.hidden).toBe(true);
    tips.update({ overview: true, mode: 'plan', hasItems: true, blocked: false });
    expect(els.tip.hidden).toBe(true);
  });

  it('đổi màn hình thì gợi ý cũ ẩn, gợi ý mới hiện; sang màn hình không có gợi ý thì ẩn hẳn', () => {
    const { els, tips } = mount();
    tips.update({ overview: true, mode: 'plan', hasItems: true, blocked: false });
    tips.update({ overview: true, mode: '3d', hasItems: true, blocked: false });
    expect(els.tipText.textContent).toBe('Kéo chuột để xoay, cuộn để phóng to');
    tips.update({ overview: false, mode: 'elev', hasItems: true, blocked: false });
    expect(els.tip.hidden).toBe(true);
  });

  it('tự ẩn sau TIP_MS; đổi ngôn ngữ thì viết lại câu đang hiện', () => {
    vi.useFakeTimers();
    const { els, tips } = mount();
    tips.update({ overview: true, mode: 'plan', hasItems: true, blocked: false });
    setLang('en');
    tips.paint();
    expect(els.tipText.textContent).toBe('Double-click a room to zoom into its detailed design');
    vi.advanceTimersByTime(TIP_MS + 1);
    expect(els.tip.hidden).toBe(true);
  });

  it('hộp thoại đang mở thì không hiện, và gợi ý chưa bị đánh dấu là đã xem', () => {
    const { kv, els, tips } = mount();
    tips.update({ overview: true, mode: 'plan', hasItems: true, blocked: true });
    expect(els.tip.hidden).toBe(true);
    expect(loadSeen(kv)).toEqual([]);
  });
});

describe('sao chép, dán món', () => {
  const room = () => {
    let uid = 100;
    const layout = freshLayout(ROOMS.ngu, registry, () => uid++);
    return { layout, next: () => uid++, R: roomGeo(ROOMS.ngu, layout) };
  };

  it('dán đồ sàn: bản mới có mã mới, không khóa, lệch 20 cm mỗi lần dán và nằm trong phòng', () => {
    const { layout, next } = room();
    const src = layout.items[0]!;
    src.locked = true;
    const clip = copyItem(layout, { scope: 'floor', uid: src.uid })!;
    const a = pasteItem(layout, clip, next, 1)!;
    const b = pasteItem(layout, clip, next, 2)!;
    const pa = findItem(layout, a)!;
    const pb = findItem(layout, b)!;
    expect(pa.uid).not.toBe(src.uid);
    expect(pa.locked).toBeUndefined();
    expect(pa.x).toBe(Math.min(src.x + 20, layout.W));
    expect(pb.x).toBe(Math.min(src.x + 40, layout.W));
    expect(pb.x).toBeLessThanOrEqual(layout.W);
  });

  it('bản chụp độc lập với món gốc; dán được sang phòng khác', () => {
    const { layout, next } = room();
    const other = freshLayout(ROOMS.khach, registry, next);
    const src = layout.items[0]!;
    const clip = copyItem(layout, { scope: 'floor', uid: src.uid })!;
    src.x = 1;
    const n = other.items.length;
    const sel = pasteItem(other, clip, next)!;
    expect(other.items).toHaveLength(n + 1);
    expect(findItem(other, sel)!.x).not.toBe(21);
  });

  it('đồ gắn tường dán lên đúng cạnh cũ, kẹp trong chiều dài tường', () => {
    const { layout, next } = room();
    const wl = (['T', 'R', 'B', 'L'] as const).find((w) => layout.walls[w].length > 0);
    if (!wl) return;
    const src = layout.walls[wl][0]!;
    const clip = copyItem(layout, { scope: wl, uid: src.uid })!;
    const sel = pasteItem(layout, clip, next, 50)!;
    const len = wl === 'T' || wl === 'B' ? layout.W : layout.H;
    expect(sel.scope).toBe(wl);
    expect(findItem(layout, sel)!.x).toBeLessThanOrEqual(len);
  });

  it('món không còn thì không sao chép được', () => {
    const { layout } = room();
    expect(copyItem(layout, { scope: 'floor', uid: -5 })).toBeNull();
  });
});

describe('giao diện cho người mới', () => {
  it('hàng tab phòng bắt đầu bằng tab "Cả căn hộ", được chọn khi xem cả căn', () => {
    const rooms = [{ id: 'ngu', type: 'ngu' as const, name: 'Phòng ngủ' }];
    expect(roomTabsHtml(rooms, 'ngu', true).startsWith('<button class="tab tab-all" type="button" data-apt="1" aria-pressed="true">Cả căn hộ</button>')).toBe(true);
    expect(roomTabsHtml(rooms, 'ngu', false)).toContain('data-apt="1" aria-pressed="false"');
    setLang('en');
    expect(roomTabsHtml(rooms, 'ngu', true)).toContain('>Whole apartment</button>');
  });

  it('món đang chọn có vòng viền riêng và đánh dấu data-sel, kể cả khi viền món đã là màu cảnh báo', () => {
    const layout = freshLayout(ROOMS.ngu, registry, (() => { let u = 1; return () => u++; })());
    const R = roomGeo(ROOMS.ngu, layout);
    const it = layout.items[0]!;
    const picked = renderPlan({ layout, R, reg: registry, sel: { scope: 'floor', uid: it.uid }, dim: false });
    expect((picked.svg.match(/class="selring"/g) ?? []).length).toBe(1);
    expect((picked.svg.match(/data-sel="true"/g) ?? []).length).toBe(1);
    const none = renderPlan({ layout, R, reg: registry, sel: null, dim: false });
    expect(none.svg).not.toContain('selring');
    expect(none.svg).not.toContain('data-sel');
  });

  it('mặt đứng: món đang chọn cũng có vòng viền', () => {
    const layout = freshLayout(ROOMS.bep, registry, (() => { let u = 1; return () => u++; })());
    const R = roomGeo(ROOMS.bep, layout);
    const wl = (['T', 'R', 'B', 'L'] as const).find((w) => layout.walls[w].length > 0)!;
    const it = layout.walls[wl][0]!;
    const f = renderElevation({ layout, R, reg: registry, wall: wl, sel: { scope: wl, uid: it.uid }, dim: false });
    expect((f.svg.match(/class="selring"/g) ?? []).length).toBe(1);
    expect(renderElevation({ layout, R, reg: registry, wall: wl, sel: null, dim: false }).svg).not.toContain('selring');
  });
});
