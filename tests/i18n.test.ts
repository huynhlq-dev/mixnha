import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fm } from '../src/core/format';
import { freshLayout } from '../src/core/layout';
import { registry } from '../src/core/registry';
import { roomGeo } from '../src/core/room';
import { ROOM_TYPE_IDS, ROOMS } from '../src/data/rooms';
import * as palettes from '../src/data/palettes';
import { WALL_NAMES } from '../src/data/walls';
import { decimalMark, getLang, LANG_KEY, loadLang, onLang, parseLang, saveLang, setLang, t, tn, type Lang } from '../src/i18n';
import { DomTranslator, normalizeText } from '../src/i18n/dom';
import { EN } from '../src/i18n/en';
import { STATUS_LABEL, PLACE_LABEL, UNKNOWN_GROUP, summaryText } from '../src/gallery/model';
import { memoryKV } from '../src/storage/kv';
import { aptInfoHtml, aptListHtml } from '../src/ui/apartmentPanel';
import { bindLanguage } from '../src/ui/lang';
import { libraryGroups, libraryHint } from '../src/ui/library';
import { newProjectSummary } from '../src/ui/newProject';
import { remindMessage } from '../src/ui/remind';
import { roomTabsHtml, wallTabsHtml } from '../src/ui/nav';
import { describe3D, describeApartment3D } from '../src/views/info3d';
import { renderApartment, type AptRoom } from '../src/views/apartment';
import { renderPlan } from '../src/views/plan';

afterEach(() => setLang('vi'));

/** Chữ không cần dịch: tên thương hiệu, số, ký hiệu. */
const NO_TRANSLATE = new Set(['Mix Nhà', '3D', '−', '+', '−90°', '+90°', '↺ 90°', '↻ 90°', '×', '›', '?', '/', '💡', '←↑↓→', 'Ctrl', 'Shift', 'Delete', 'Esc', 'C', 'D', 'R', 'V', 'Z']);

const root = join(__dirname, '..');

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? tsFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const unescape = (s: string): string => s.replace(/\\(['\\n])/g, (_, c: string) => (c === 'n' ? '\n' : c));

/** Mọi câu tiếng Việt viết thẳng trong t('...') ở mã nguồn (trừ chính module i18n). */
function codeKeys(): Set<string> {
  const keys = new Set<string>();
  for (const file of tsFiles(join(root, 'src')).filter((f) => !f.includes('/i18n/'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) keys.add(unescape(m[1]!));
  }
  return keys;
}

/** Mọi đoạn chữ và thuộc tính viết sẵn trong một file HTML. */
function htmlKeys(file: string): string[] {
  const html = readFileSync(join(root, file), 'utf8').replace(/%VITE_APP_NAME%/g, 'Mix Nhà');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const dom = new DomTranslator();
  dom.collect(doc.documentElement);
  return dom.keys();
}

/** Chữ lấy từ dữ liệu khai báo (tên món, nhóm, cửa, phòng, màu, tường...) và được dịch lúc hiện bằng tn(). */
function dataKeys(): Set<string> {
  const keys = new Set<string>();
  const add = (s: string | undefined): void => void (s && keys.add(s));
  for (const it of registry.items) {
    add(it.name);
    add(it.short);
    add(it.note);
  }
  for (const c of registry.categories) {
    add(c.name);
    add(c.label3d);
  }
  for (const o of registry.openings) add(o.name);
  for (const id of ROOM_TYPE_IDS) {
    add(ROOMS[id].name);
    for (const g of ROOMS[id].guides ?? []) add(g.label);
  }
  for (const list of [palettes.FLOOR_COLORS, palettes.WALL_COLORS, palettes.ITEM_COLORS]) for (const c of list) add(c.name);
  for (const n of Object.values(WALL_NAMES)) add(n);
  for (const v of [...Object.values(STATUS_LABEL), ...Object.values(PLACE_LABEL), UNKNOWN_GROUP.name]) add(v);
  return keys;
}

const holes = (keys: Iterable<string>): string[] => [...keys].filter((k) => !NO_TRANSLATE.has(k) && EN[k] === undefined);
const params = (s: string): string[] => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort();

describe('từ điển tiếng Anh đủ và đúng', () => {
  it('mọi câu trong t(...) của mã nguồn đều có bản dịch', () => {
    expect(holes(codeKeys())).toEqual([]);
  });

  it('mọi chữ viết sẵn trong index.html và gallery.html đều có bản dịch', () => {
    expect(holes(htmlKeys('index.html'))).toEqual([]);
    expect(holes(htmlKeys('gallery.html'))).toEqual([]);
  });

  it('mọi tên trong dữ liệu (món, tên ngắn, ghi chú, nhóm, cửa, phòng, màu, tường) đều có bản dịch', () => {
    expect(holes(dataKeys())).toEqual([]);
  });

  it('không có bản dịch thừa: mỗi khóa đều được dùng ở đâu đó', () => {
    const used = new Set([...codeKeys(), ...htmlKeys('index.html'), ...htmlKeys('gallery.html'), ...dataKeys()]);
    expect(Object.keys(EN).filter((k) => !used.has(k))).toEqual([]);
  });

  it('bản dịch dùng đúng các tham số {tên} của câu gốc, dạng số ít|số nhiều chỉ khi có {n}', () => {
    for (const [key, value] of Object.entries(EN)) {
      const variants = value.split('|');
      // mỗi dạng chỉ dùng tham số có trong câu gốc (số ít được bỏ {n}); gộp lại thì đủ cả
      for (const variant of variants) for (const p of params(variant)) expect(params(key), key).toContain(p);
      expect([...new Set(variants.flatMap(params))].sort(), key).toEqual(params(key));
      if (variants.length > 1) {
        expect(variants, key).toHaveLength(2);
        expect(params(key), key).toContain('n');
      }
      expect(value.trim(), key).toBe(value);
      expect(value, key).not.toBe('');
    }
  });

  it('bản dịch không còn dấu tiếng Việt (trừ tên thương hiệu)', () => {
    const vi = /[ạảãàáâậầấẩẫăắằặẳẵéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ]/i;
    for (const [key, value] of Object.entries(EN)) {
      if (vi.test(value)) expect(value.replace(/Mix Nhà/g, ''), key).not.toMatch(vi);
    }
  });
});

describe('t và tn', () => {
  it('tiếng Việt: trả lại đúng câu gốc, thay {tham số}', () => {
    expect(getLang()).toBe('vi');
    expect(t('Chọn ít nhất một phòng.')).toBe('Chọn ít nhất một phòng.');
    expect(t('Đã xóa {name}. Bấm Hoàn tác để lấy lại.', { name: 'Giường đôi' })).toBe('Đã xóa Giường đôi. Bấm Hoàn tác để lấy lại.');
    // tham số thiếu thì để nguyên chỗ trống
    expect(t('Tối đa {max} phòng, đang chọn {n}.', { max: 12 })).toBe('Tối đa 12 phòng, đang chọn {n}.');
  });

  it('tiếng Anh: tra từ điển, thay tham số, chọn số ít hay số nhiều theo n', () => {
    setLang('en');
    expect(t('Chọn ít nhất một phòng.')).toBe('Choose at least one room.');
    expect(t('Đã xóa {name}. Bấm Hoàn tác để lấy lại.', { name: tn('Giường đôi') })).toBe('Deleted Double bed. Click Undo to get it back.');
    expect(t('{n} phòng', { n: 1 })).toBe('1 room');
    expect(t('{n} phòng', { n: 4 })).toBe('4 rooms');
    expect(t('{n} phòng', { n: 0 })).toBe('0 rooms');
    expect(t('Nhập {n} phòng', { n: 2 })).toBe('Import 2 rooms');
  });

  it('câu chưa có bản dịch thì giữ nguyên tiếng Việt (không vỡ giao diện)', () => {
    setLang('en');
    expect(t('Câu này chưa có trong từ điển {x}', { x: 1 })).toBe('Câu này chưa có trong từ điển 1');
  });

  it('tn dịch tên có sẵn, giữ số cuối của tên đánh số, để nguyên tên người dùng tự đặt', () => {
    expect(tn('Phòng ngủ 2')).toBe('Phòng ngủ 2');
    setLang('en');
    expect(tn('Phòng ngủ')).toBe('Bedroom');
    expect(tn('Phòng ngủ 2')).toBe('Bedroom 2');
    expect(tn('Phòng trống 12')).toBe('Empty room 12');
    expect(tn('Phòng của ba mẹ')).toBe('Phòng của ba mẹ');
    expect(tn('Phòng ngủ khách 3')).toBe('Phòng ngủ khách 3');
    expect(tn('')).toBe('');
  });

  it('dấu thập phân theo ngôn ngữ', () => {
    expect(decimalMark()).toBe(',');
    expect(fm(2.5)).toBe('2,5');
    setLang('en');
    expect(decimalMark()).toBe('.');
    expect(fm(2.5)).toBe('2.5');
    expect(fm(14)).toBe('14');
  });

  it('báo cho người đăng ký khi đổi ngôn ngữ, chỉ khi thật sự đổi', () => {
    const fn = vi.fn();
    const off = onLang(fn);
    setLang('vi');
    expect(fn).not.toHaveBeenCalled();
    setLang('en');
    expect(fn).toHaveBeenCalledWith('en');
    off();
    setLang('vi');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('lưu ngôn ngữ', () => {
  it('chỉ "en" mới là tiếng Anh; mặc định và giá trị lạ là tiếng Việt', () => {
    expect(parseLang('en')).toBe('en');
    expect(parseLang('vi')).toBe('vi');
    expect(parseLang(null)).toBe('vi');
    expect(parseLang('fr')).toBe('vi');
    expect(loadLang(memoryKV())).toBe('vi');
  });

  it('ghi rồi đọc lại đúng khóa', () => {
    const kv = memoryKV();
    expect(saveLang(kv, 'en')).toBe(true);
    expect(kv.get(LANG_KEY)).toBe('en');
    expect(loadLang(kv)).toBe('en');
  });
});

function page(): { group: HTMLElement; box: HTMLElement; vi: HTMLButtonElement; en: HTMLButtonElement } {
  document.body.innerHTML =
    '<div id="box"><h1>Tạo dự án</h1><p>  Tìm\n   món  </p><button title="Hoàn tác (Ctrl+Z)" aria-label="Hoàn tác">Hoàn tác</button>' +
    '<input placeholder="Tìm: giường, sofa, tủ..."><span data-i18n-skip>Hoàn tác</span><span>Không có trong từ điển</span></div>' +
    '<div id="langBox"><button data-lang="vi" aria-pressed="true">VI</button><button data-lang="en" aria-pressed="false">EN</button></div>';
  return {
    group: document.getElementById('langBox')!,
    box: document.getElementById('box')!,
    vi: document.querySelector<HTMLButtonElement>('[data-lang="vi"]')!,
    en: document.querySelector<HTMLButtonElement>('[data-lang="en"]')!,
  };
}

describe('DomTranslator', () => {
  it('quét đoạn chữ và thuộc tính, dịch sang tiếng Anh rồi trả về tiếng Việt, giữ khoảng trắng đầu cuối', () => {
    const { box } = page();
    const dom = new DomTranslator();
    dom.collect(box);
    expect(dom.keys()).toContain('Tìm món');
    expect(dom.keys()).not.toContain('VI');

    setLang('en');
    dom.apply();
    expect(box.querySelector('h1')!.textContent).toBe('Create project');
    expect(box.querySelector('p')!.textContent).toBe('  Search items  ');
    const btn = box.querySelector('button')!;
    expect(btn.textContent).toBe('Undo');
    expect(btn.getAttribute('title')).toBe('Undo (Ctrl+Z)');
    expect(btn.getAttribute('aria-label')).toBe('Undo');
    expect(box.querySelector('input')!.getAttribute('placeholder')).toBe('Search: bed, sofa, cabinet...');
    expect(document.documentElement.lang).toBe('en');
    // phần tử data-i18n-skip và câu chưa có bản dịch giữ nguyên
    expect(box.querySelector('[data-i18n-skip]')!.textContent).toBe('Hoàn tác');
    expect(box.querySelectorAll('span')[1]!.textContent).toBe('Không có trong từ điển');

    setLang('vi');
    dom.apply();
    expect(btn.textContent).toBe('Hoàn tác');
    expect(btn.getAttribute('title')).toBe('Hoàn tác (Ctrl+Z)');
    expect(box.querySelector('p')!.textContent).toBe('  Tìm món  ');
    expect(document.documentElement.lang).toBe('vi');
  });

  it('chuẩn hóa khoảng trắng như HTML', () => {
    expect(normalizeText('  a \n\t b  ')).toBe('a b');
  });
});

describe('bindLanguage', () => {
  it('chưa lưu gì thì tiếng Việt, nút VI đang bật', () => {
    const { group, box, vi, en } = page();
    const dom = new DomTranslator();
    dom.collect(box);
    bindLanguage(group, memoryKV(), dom);
    expect(getLang()).toBe('vi');
    expect(vi.getAttribute('aria-pressed')).toBe('true');
    expect(en.getAttribute('aria-pressed')).toBe('false');
    expect(box.querySelector('h1')!.textContent).toBe('Tạo dự án');
  });

  it('đã lưu tiếng Anh thì áp dụng ngay lúc khởi động', () => {
    const { group, box, en } = page();
    const dom = new DomTranslator();
    dom.collect(box);
    bindLanguage(group, memoryKV({ [LANG_KEY]: 'en' }), dom);
    expect(getLang()).toBe('en');
    expect(en.getAttribute('aria-pressed')).toBe('true');
    expect(box.querySelector('h1')!.textContent).toBe('Create project');
  });

  it('bấm EN rồi VI: đổi chữ, đổi nút bật, ghi nhớ và báo onChange; bấm lại nút đang bật thì không làm gì', () => {
    const { group, box, vi, en } = page();
    const dom = new DomTranslator();
    dom.collect(box);
    const kv = memoryKV();
    const seen: Lang[] = [];
    bindLanguage(group, kv, dom, (l) => seen.push(l));

    en.click();
    expect(getLang()).toBe('en');
    expect(kv.get(LANG_KEY)).toBe('en');
    expect(box.querySelector('h1')!.textContent).toBe('Create project');
    expect(en.getAttribute('aria-pressed')).toBe('true');
    expect(vi.getAttribute('aria-pressed')).toBe('false');
    en.click();
    expect(seen).toEqual(['en']);

    vi.click();
    expect(getLang()).toBe('vi');
    expect(kv.get(LANG_KEY)).toBe('vi');
    expect(box.querySelector('h1')!.textContent).toBe('Tạo dự án');
    expect(seen).toEqual(['en', 'vi']);
  });
});

describe('giao diện do code sinh ra theo ngôn ngữ', () => {
  const aptRooms = (): AptRoom[] =>
    (['ngu', 'khach'] as const).map((id) => {
      const layout = freshLayout(ROOMS[id], registry, () => 1);
      return { id, type: id, name: ROOMS[id].name, layout, geo: roomGeo(ROOMS[id], layout) };
    });

  it('thư viện: tên nhóm, tên món, gợi ý, tìm bằng tên tiếng Anh', () => {
    setLang('en');
    const plan = libraryGroups(registry, 'plan', '');
    expect(plan.find((g) => g.id === 'sleeping')!.title).toBe('Sleeping');
    expect(plan.find((g) => g.id === 'sleeping')!.items.find((i) => i.id === 'bed2')!.name).toBe('Double bed');
    expect(plan.find((g) => g.id === 'rooms')!.title).toBe('Rooms (add to apartment)');
    expect(libraryHint('plan')).toBe('Choose a group, then click or drag an item into the drawing.');
    expect(libraryHint('plan', true)).toBe('Click or drag an item into the drawing.');
    expect(libraryGroups(registry, 'plan', 'double bed').map((g) => g.id)).toEqual(['sleeping']);
    // vẫn tìm được bằng tên tiếng Việt khi đang xem tiếng Anh
    expect(libraryGroups(registry, 'plan', 'giuong').map((g) => g.id)).toEqual(['sleeping']);
    expect(libraryGroups(registry, 'apartment3d', '')[0]!.title).toBe('Room');
  });

  it('tab phòng và tường', () => {
    setLang('en');
    expect(roomTabsHtml([{ id: 'ngu', type: 'ngu', name: 'Phòng ngủ' }, { id: 'p2', type: 'ngu', name: 'Phòng ngủ 2' }], 'ngu')).toContain('>Bedroom 2</button>');
    expect(wallTabsHtml('T')).toContain('>Top wall</button>');
  });

  it('mô hình căn hộ: tên đọc, tiêu đề, trạng thái, danh sách và số liệu', () => {
    const rs = aptRooms();
    setLang('en');
    const f = renderApartment(rs);
    expect(f.svg).toContain('Bedroom, 400 × 350 cm, 14 m². Click to select, double-click to design this room');
    expect(f.svg).toContain('>Bedroom</text>');
    expect(f.title).toBe('Whole apartment');
    expect(f.size).toBe('2 rooms');
    expect(f.status.text).toContain('Click a room on the model to zoom in and design it.');
    expect(aptListHtml(rs)).toContain('<h3>Rooms</h3>');
    expect(aptListHtml(rs)).toMatch(/· \d+ items?</);
    const info = aptInfoHtml(rs);
    expect(info).toContain('<b>2</b><span>Rooms</span>');
    expect(info).toContain('<span>Interior area</span>');
  });

  it('mặt bằng một phòng: tiêu đề, mô tả đọc và trạng thái', () => {
    const layout = freshLayout(ROOMS.ngu, registry, () => 1);
    const R = roomGeo(ROOMS.ngu, layout);
    const vi = renderPlan({ layout, R, reg: registry, sel: null, dim: false });
    setLang('en');
    const en = renderPlan({ layout, R, reg: registry, sel: null, dim: false });
    expect(vi.status.text).toContain('Đồ chiếm');
    expect(en.status.text).toMatch(/Items cover \d+% of the floor area\.$/);
    expect(en.title).toBe('Bedroom');
    expect(vi.title).toBe('Phòng ngủ');
  });

  it('thông tin 3D, tóm tắt dự án mới, nhắc sao lưu và gallery', () => {
    setLang('en');
    expect(describeApartment3D(aptRooms(), false).title).toBe('Whole apartment · 3D');
    expect(describeApartment3D(aptRooms(), true).status.text).toContain("Can't build the 3D view");
    expect(describe3D(freshLayout(ROOMS.ngu, registry, () => 1), roomGeo(ROOMS.ngu, freshLayout(ROOMS.ngu, registry, () => 1)), registry, true).title).toBe('Bedroom · 3D');
    expect(newProjectSummary({ ngu: 1, khach: 0, bep: 0, wc: 0, lamviec: 0, trong: 0, banchong: 0 }).text).toBe('1 room · about 14 m² floor (default size, changeable later)');
    expect(newProjectSummary({ ngu: 0, khach: 0, bep: 0, wc: 0, lamviec: 0, trong: 0, banchong: 0 }).text).toBe('Choose at least one room.');
    const now = Date.now();
    expect(remindMessage({}, now)).toBe("You haven't exported a file yet.");
    expect(remindMessage({ lastExportAt: now }, now)).toBe('Last exported today.');
    expect(remindMessage({ lastExportAt: now - 86_400_000 }, now)).toBe('Last exported 1 day ago.');
    expect(remindMessage({ lastExportAt: now - 3 * 86_400_000 }, now)).toBe('Last exported 3 days ago.');
    expect(summaryText(registry.items, [])).toMatch(/^\d+ items · \d+ live · \d+ in progress · \d+ retired\. No data errors\.$/);
  });
});
