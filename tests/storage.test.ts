import { afterEach, describe, expect, it, vi } from 'vitest';
import { hexMix } from '../src/core/color';
import { LIMITS } from '../src/core/limits';
import { flipDoorHinge, moveOpening, toggleDoorSwing } from '../src/core/ops';
import { cloneLayout, countItems, freshLayout, maxUid } from '../src/core/layout';
import { createRegistry, registry } from '../src/core/registry';
import type { Layout, Layouts } from '../src/core/types';
import { CATEGORIES } from '../src/data/categories';
import { DEFAULT_ROOMS, ROOMS, ROOM_IDS, type RoomEntry, type RoomId } from '../src/data/rooms';
import type { ItemDef } from '../src/data/schema';
import { WALL_KEYS } from '../src/data/walls';
import * as backup from '../src/storage/backup';
import {
  buildFile,
  cleanText,
  FILE_APP,
  FILE_LIMITS,
  isoLocal,
  layoutFromImported,
  makeFilename,
  parseDesignFile,
  serializeFile,
  summarizeExport,
} from '../src/storage/file';
import { History } from '../src/storage/history';
import { sanitizeApt, sanitizeRoomList } from '../src/storage/sanitize';
import { browserKV, memoryKV, type KV } from '../src/storage/kv';
import { CURRENT_VER, migrate } from '../src/storage/migrations';
import { loadState, saveState, serializeState, STATE_KEY } from '../src/storage/save';

const load = (kv: KV) => loadState(kv, registry, () => nextUid());

let uid = 1;
const nextUid = () => uid++;
const sampleLayouts = (): Layouts => {
  uid = 1;
  return Object.fromEntries(ROOM_IDS.map((id) => [id, freshLayout(ROOMS[id], registry, nextUid)])) as Layouts;
};
const withoutUid = (l: Layout): unknown => JSON.parse(JSON.stringify(l, (k, v) => (k === 'uid' ? 0 : v)));

/* ---------- Hoàn tác / Làm lại ---------- */

function clock(start = 10_000) {
  let t = start;
  return { now: () => t, tick: (ms: number) => void (t += ms) };
}

/** Bố trí có x của món đầu tiên khác nhau, để tạo ra các bước thay đổi. */
function moved(l: Layout, x: number): Layout {
  const c = cloneLayout(l);
  c.items[0]!.x = x;
  return c;
}

describe('lịch sử hoàn tác', () => {
  it('không ghi bước khi bố trí không đổi', () => {
    const base = sampleLayouts();
    const h = new History();
    h.reset(base);
    expect(h.commit('ngu', base.ngu, false)).toBe(false);
    expect(h.canUndo('ngu')).toBe(false);
  });

  it('lùi và tiến đúng trạng thái, thao tác mới xóa các bước tiến', () => {
    const base = sampleLayouts();
    const h = new History();
    h.reset(base);
    const a = moved(base.ngu, 111);
    const b = moved(base.ngu, 222);
    expect(h.commit('ngu', a, false)).toBe(true);
    expect(h.commit('ngu', b, false)).toBe(true);
    expect(h.undo('ngu')).toEqual(a);
    expect(h.undo('ngu')).toEqual(base.ngu);
    expect(h.undo('ngu')).toBeNull();
    expect(h.canRedo('ngu')).toBe(true);
    expect(h.redo('ngu')).toEqual(a);
    // làm thao tác mới giữa chừng thì không còn Làm lại
    expect(h.commit('ngu', moved(base.ngu, 333), false)).toBe(true);
    expect(h.canRedo('ngu')).toBe(false);
    expect(h.redo('ngu')).toBeNull();
  });

  it('giữ tối đa 100 bước mỗi phòng, bỏ bước cũ nhất', () => {
    const base = sampleLayouts();
    const h = new History();
    h.reset(base);
    for (let i = 1; i <= LIMITS.undoSteps + 5; i++) h.commit('ngu', moved(base.ngu, 100 + i), false);
    let n = 0;
    let last: Layout | null = null;
    for (let l = h.undo('ngu'); l; l = h.undo('ngu')) {
      n++;
      last = l;
    }
    expect(n).toBe(LIMITS.undoSteps);
    // bước xa nhất còn nhớ là trạng thái sau 5 lần đầu
    expect(last!.items[0]!.x).toBe(105);
  });

  it('thao tác liên tục trong 1 giây gộp thành một bước, sau 1 giây thì tách', () => {
    const base = sampleLayouts();
    const c = clock();
    const h = new History({ now: c.now });
    h.reset(base);
    h.commit('ngu', moved(base.ngu, 101), true);
    c.tick(300);
    h.commit('ngu', moved(base.ngu, 102), true);
    c.tick(300);
    h.commit('ngu', moved(base.ngu, 103), true);
    c.tick(1500);
    h.commit('ngu', moved(base.ngu, 104), true);
    // bốn lần sửa nhưng chỉ hai bước: (101..103) và (104)
    expect(h.undo('ngu')!.items[0]!.x).toBe(103);
    expect(h.undo('ngu')!.items[0]!.x).toBe(base.ngu.items[0]!.x);
    expect(h.undo('ngu')).toBeNull();
  });

  it('thao tác không liên tục luôn tạo bước riêng, và không gộp vào thao tác liên tục trước đó', () => {
    const base = sampleLayouts();
    const c = clock();
    const h = new History({ now: c.now });
    h.reset(base);
    h.commit('ngu', moved(base.ngu, 101), true);
    c.tick(100);
    h.commit('ngu', moved(base.ngu, 102), false);
    c.tick(100);
    h.commit('ngu', moved(base.ngu, 103), true);
    expect(h.undo('ngu')!.items[0]!.x).toBe(102);
    expect(h.undo('ngu')!.items[0]!.x).toBe(101);
    expect(h.undo('ngu')!.items[0]!.x).toBe(base.ngu.items[0]!.x);
  });

  it('không gộp sang phòng khác, và sau khi Hoàn tác thì thao tác liên tục bắt đầu bước mới', () => {
    const base = sampleLayouts();
    const c = clock();
    const h = new History({ now: c.now });
    h.reset(base);
    h.commit('ngu', moved(base.ngu, 101), true);
    c.tick(50);
    h.commit('khach', moved(base.khach, 202), true);
    expect(h.canUndo('ngu')).toBe(true);
    expect(h.canUndo('khach')).toBe(true);
    expect(h.undo('khach')).toEqual(base.khach);
    // lịch sử phòng ngủ không bị ảnh hưởng
    expect(h.canUndo('ngu')).toBe(true);
    c.tick(50);
    h.commit('ngu', moved(base.ngu, 103), true);
    expect(h.undo('ngu')!.items[0]!.x).toBe(101);
  });

  it('reset xóa sạch lịch sử', () => {
    const base = sampleLayouts();
    const h = new History();
    h.reset(base);
    h.commit('ngu', moved(base.ngu, 101), false);
    h.reset(base);
    expect(h.canUndo('ngu')).toBe(false);
    expect(h.canRedo('ngu')).toBe(false);
  });
});

/* ---------- Tự lưu và đọc lại ---------- */

describe('tự lưu trong trình duyệt', () => {
  const pen = { color: '#336699', recent: ['#112233', '#445566'] };

  it('lưu rồi đọc lại đủ phòng, phòng đang mở và bút', () => {
    const kv = memoryKV();
    const layouts = sampleLayouts();
    expect(saveState(kv, 'bep', layouts, pen)).toBe(true);
    const s = load(kv)!;
    expect(s.room).toBe('bep');
    for (const id of ROOM_IDS) expect(withoutUid(s.layouts[id]!)).toEqual(withoutUid(layouts[id]));
    expect(s.pen).toEqual(pen);
  });

  it('mọi món đọc lại đều có uid mới, không trùng nhau giữa các phòng', () => {
    const kv = memoryKV();
    saveState(kv, 'ngu', sampleLayouts(), pen);
    uid = 1000;
    const s = load(kv)!;
    const uids: number[] = [];
    for (const l of Object.values(s.layouts)) {
      for (const i of l!.items) uids.push(i.uid);
      for (const w of WALL_KEYS) for (const i of l!.walls[w]) uids.push(i.uid);
      for (const o of [...l!.doors, ...l!.windows]) uids.push(o.uid);
    }
    expect(uids.length).toBeGreaterThan(10);
    expect(new Set(uids).size).toBe(uids.length);
    expect(Math.min(...uids)).toBeGreaterThanOrEqual(1000);
    expect(maxUid(s.layouts)).toBe(Math.max(...uids));
  });

  it('dữ liệu tự lưu cũng được làm sạch như file nhập: màu hỏng, số hỏng, món lạ', () => {
    const layouts = sampleLayouts();
    const raw = JSON.parse(JSON.stringify({ ver: CURRENT_VER, room: 'ngu', layouts })) as { layouts: Record<string, Layout> };
    const l = raw.layouts.ngu!;
    l.floor = 'red;background:url(x)';
    l.items[0]!.color = '#zzz';
    l.items[1]!.x = 'abc' as unknown as number;
    l.items.push({ id: 'khongco', name: 'Món lạ', w: 100, d: 50, x: 10, y: 10, rot: 0, color: '#112233', z: 1, uid: 77 });
    l.items.push({ id: 'khongco2', w: 100, d: 50, x: 10, y: 10 } as never);
    const s = load(memoryKV({ [STATE_KEY]: JSON.stringify(raw) }))!;
    const ngu = s.layouts.ngu!;
    expect(ngu.floor).toMatch(/^#[0-9a-f]{6}$/);
    expect(ngu.items.every((i) => /^#[0-9a-f]{6}$/.test(i.color) && Number.isFinite(i.x))).toBe(true);
    expect(ngu.items.some((i) => i.id === 'khongco')).toBe(true);
    expect(ngu.items.some((i) => i.id === 'khongco2')).toBe(false);
    expect(ngu.items).toHaveLength(layouts.ngu.items.length - 1 + 1);
  });

  it('chưa có gì, hoặc dữ liệu hỏng, thì trả về null để dùng bố trí mẫu', () => {
    expect(load(memoryKV())).toBeNull();
    for (const raw of ['{không phải json', 'null', '5', '"x"', '[]', '{}', '{"ver":3,"layouts":5}']) {
      expect(load(memoryKV({ [STATE_KEY]: raw }))).toBeNull();
    }
  });

  it('phòng nào hỏng thì bỏ riêng phòng đó, các phòng còn lại vẫn đọc được', () => {
    const layouts = sampleLayouts();
    const raw = { ver: CURRENT_VER, room: 'khach', layouts: { ngu: layouts.ngu, khach: { oops: 1 }, bep: 'x', wc: layouts.wc }, pen };
    const s = load(memoryKV({ [STATE_KEY]: JSON.stringify(raw) }))!;
    expect(Object.keys(s.layouts).sort()).toEqual(['ngu', 'wc']);
    expect(s.room).toBe('khach');
  });

  it('phòng đang mở không hợp lệ thì về phòng đầu tiên; màu bút hỏng thì bỏ bút', () => {
    const layouts = sampleLayouts();
    const raw = { ver: CURRENT_VER, room: 'garage', layouts, pen: { color: 'đỏ', recent: ['#111111'] } };
    const s = load(memoryKV({ [STATE_KEY]: JSON.stringify(raw) }))!;
    expect(s.room).toBe(ROOM_IDS[0]);
    expect(s.pen).toBeNull();
  });

  it('màu bút gần đây: bỏ mã sai, viết thường, tối đa 8 màu', () => {
    const layouts = sampleLayouts();
    const recent = ['#AABBCC', 'x', ...Array.from({ length: 12 }, (_, i) => `#0000${String(i).padStart(2, '0')}`)];
    const raw = { ver: CURRENT_VER, room: 'ngu', layouts, pen: { color: '#ABC', recent } };
    const s = load(memoryKV({ [STATE_KEY]: JSON.stringify(raw) }))!;
    expect(s.pen!.color).toBe('#aabbcc');
    expect(s.pen!.recent).toHaveLength(8);
    expect(s.pen!.recent[0]).toBe('#aabbcc');
  });

  it('dữ liệu bản 2: màu tường được làm nhạt một lần khi đọc', () => {
    const layouts = sampleLayouts();
    layouts.ngu.wall = '#5c6b66';
    const raw = { ver: 2, room: 'ngu', layouts, pen: null };
    const s = load(memoryKV({ [STATE_KEY]: JSON.stringify(raw) }))!;
    expect(s.layouts.ngu!.wall).toBe(hexMix('#5c6b66', 0.82));
  });

  it('báo false khi không ghi được, không ném lỗi', () => {
    const full: KV = { get: () => null, set: () => false, remove: () => {} };
    expect(saveState(full, 'ngu', sampleLayouts(), pen)).toBe(false);
  });
});

describe('kho trình duyệt khi localStorage bị chặn', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('không ném lỗi khi đọc, ghi, xóa', () => {
    const boom = () => {
      throw new Error('SecurityError');
    };
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom });
    const kv = browserKV();
    expect(kv.get('a')).toBeNull();
    expect(kv.set('a', 'b')).toBe(false);
    expect(() => kv.remove('a')).not.toThrow();
  });

  it('đọc ghi bình thường khi cho phép', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    const kv = browserKV();
    expect(kv.set('a', 'b')).toBe(true);
    expect(kv.get('a')).toBe('b');
    kv.remove('a');
    expect(kv.get('a')).toBeNull();
  });
});

/* ---------- Nhắc sao lưu ---------- */

describe('nhắc sao lưu', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const T0 = 1_800_000_000_000;

  it('không có thay đổi chưa xuất thì không nhắc', () => {
    expect(backup.shouldRemind({}, T0)).toBe(false);
    expect(backup.shouldRemind({ lastExportAt: T0 - 30 * DAY }, T0)).toBe(false);
  });

  it('chưa xuất lần nào: tính từ lúc bắt đầu có thay đổi, đủ 7 ngày thì nhắc', () => {
    const s = backup.markDirty({}, T0);
    expect(backup.shouldRemind(s, T0 + 6 * DAY)).toBe(false);
    expect(backup.shouldRemind(s, T0 + 7 * DAY)).toBe(true);
  });

  it('chỉ ghi nhớ lần thay đổi đầu tiên kể từ lần xuất gần nhất', () => {
    const s1 = backup.markDirty({}, T0);
    const s2 = backup.markDirty(s1, T0 + 3 * DAY);
    expect(s2.dirtySince).toBe(T0);
  });

  it('đã xuất rồi thì tính từ lần xuất; xuất xong thì hết nhắc và xóa trạng thái cũ', () => {
    let s = backup.markExported({}, T0);
    s = backup.markDirty(s, T0 + 2 * DAY);
    expect(backup.shouldRemind(s, T0 + 6 * DAY)).toBe(false);
    expect(backup.shouldRemind(s, T0 + 7 * DAY)).toBe(true);
    s = backup.markExported(backup.snooze(s, T0 + 7 * DAY), T0 + 8 * DAY);
    expect(s).toEqual({ lastExportAt: T0 + 8 * DAY });
    expect(backup.shouldRemind(s, T0 + 30 * DAY)).toBe(false);
  });

  it('Để sau: im 7 ngày rồi nhắc lại', () => {
    let s = backup.markDirty({}, T0);
    s = backup.snooze(s, T0 + 8 * DAY);
    expect(backup.shouldRemind(s, T0 + 8 * DAY + 1)).toBe(false);
    expect(backup.shouldRemind(s, T0 + 14 * DAY)).toBe(false);
    expect(backup.shouldRemind(s, T0 + 15 * DAY)).toBe(true);
  });

  it('số ngày kể từ lần xuất', () => {
    expect(backup.daysSinceExport({}, T0)).toBeNull();
    expect(backup.daysSinceExport({ lastExportAt: T0 - 9.9 * DAY }, T0)).toBe(9);
    expect(backup.daysSinceExport({ lastExportAt: T0 + DAY }, T0)).toBe(0);
  });

  it('lưu, đọc lại, và chịu được dữ liệu hỏng', () => {
    const kv = memoryKV();
    const s = backup.snooze(backup.markDirty(backup.markExported({}, T0), T0 + DAY), T0 + 2 * DAY);
    backup.saveBackup(kv, s);
    expect(backup.loadBackup(kv)).toEqual(s);
    expect(backup.loadBackup(memoryKV({ [backup.BACKUP_KEY]: '{hỏng' }))).toEqual({});
    expect(backup.loadBackup(memoryKV({ [backup.BACKUP_KEY]: '{"lastExportAt":"x","dirtySince":null}' }))).toEqual({
      lastExportAt: undefined,
      dirtySince: undefined,
      snoozeUntil: undefined,
    });
  });
});

/* ---------- Nâng phiên bản dữ liệu ---------- */

describe('nâng phiên bản dữ liệu', () => {
  it('bản 2 lên bản hiện tại: làm nhạt màu tường ở cả khóa layouts và rooms, giữ nguyên phần còn lại', () => {
    const wall = (hex: string) => ({ W: 400, H: 300, ceil: 270, floor: '#e2c9a4', wall: hex, items: [], walls: { T: [], R: [], B: [], L: [] } });
    const out = migrate({ ver: 2, name: 'x', layouts: { ngu: wall('#5c6b66') }, rooms: { khach: wall('#dce8e4'), bep: wall('hỏng') } });
    expect(out.from).toBe(2);
    const d = out.doc as { ver: number; name: string; layouts: Record<string, Layout>; rooms: Record<string, Layout> };
    expect(d.ver).toBe(CURRENT_VER);
    expect(d.name).toBe('x');
    expect(d.layouts.ngu!.wall).toBe(hexMix('#5c6b66', 0.82));
    expect(d.rooms.khach!.wall).toBe(hexMix('#dce8e4', 0.82));
    expect(d.rooms.bep!.wall).toBe('hỏng');
  });

  it('bản hiện tại và bản không rõ được giữ nguyên', () => {
    const doc = { ver: CURRENT_VER, layouts: { ngu: { wall: '#5c6b66' } } };
    expect(migrate(doc).doc).toBe(doc);
    expect(migrate({ x: 1 }).doc).toEqual({ x: 1 });
  });
});

/* ---------- Xuất file ---------- */

const NOW = new Date(2026, 9, 20, 10, 5, 9); // 20/10/2026 10:05:09 giờ máy

describe('xuất file', () => {
  it('bỏ uid, làm tròn số, gắn tên, ghi chú và ngày giờ', () => {
    const layouts = sampleLayouts();
    layouts.ngu.items[0]!.x = 123.4567;
    layouts.ngu.items[0]!.rot = 33.333;
    const f = buildFile(layouts, { scope: 'all', room: 'ngu', name: '  Căn hộ <b>A</b>  ', note: 'Bản\u0007 nháp', now: NOW });
    expect(f.app).toBe(FILE_APP);
    expect(f.ver).toBe(CURRENT_VER);
    expect(f.units).toBe('cm');
    expect(f.name).toBe('Căn hộ A');
    expect(f.note).toBe('Bản nháp');
    expect(f.exportedAt).toBe(isoLocal(NOW));
    expect(f.exportedAt).toMatch(/^2026-10-20T10:05:09[+-]\d\d:\d\d$/);
    expect(Object.keys(f.rooms)).toEqual([...ROOM_IDS]);
    const first = f.rooms.ngu!.items[0]!;
    expect(first).not.toHaveProperty('uid');
    expect(first.x).toBe(123.5);
    expect(first.rot).toBe(33.3);
    expect(JSON.stringify(f)).not.toContain('"uid"');
  });

  it('chỉ xuất phòng đang mở khi chọn phạm vi một phòng', () => {
    const f = buildFile(sampleLayouts(), { scope: 'room', room: 'bep', now: NOW });
    expect(f.scope).toBe('room');
    expect(Object.keys(f.rooms)).toEqual(['bep']);
    expect(f).not.toHaveProperty('name');
    expect(f).not.toHaveProperty('note');
  });

  it('đếm số phòng, số món', () => {
    const layouts = sampleLayouts();
    const all = summarizeExport(layouts, 'all', 'ngu');
    expect(all.rooms).toBe(ROOM_IDS.length);
    expect(all.items).toBe(ROOM_IDS.reduce((n, id) => n + countItems(layouts[id]), 0));
    expect(summarizeExport(layouts, 'room', 'wc')).toEqual({ rooms: 1, items: countItems(layouts.wc) });
  });

  it('tên file tự đặt từ tên bản thiết kế và ngày', () => {
    expect(makeFilename('Căn hộ của tôi', NOW)).toBe('can-ho-cua-toi-20261020.json');
    expect(makeFilename('  Đồ  *** nội thất!! ', NOW)).toBe('do-noi-that-20261020.json');
    expect(makeFilename('', NOW)).toBe('ban-thiet-ke-20261020.json');
    expect(makeFilename(undefined, new Date(2027, 0, 5))).toBe('ban-thiet-ke-20270105.json');
    expect(makeFilename('a'.repeat(100), NOW)).toBe(`${'a'.repeat(40)}-20261020.json`);
  });

  it('cleanText bỏ thẻ HTML, ký tự điều khiển và cắt độ dài', () => {
    expect(cleanText('<script>alert(1)</script>Xin chào', 80)).toBe('alert(1)Xin chào');
    expect(cleanText('a\u0000b\nc\td', 80)).toBe('a b c d');
    expect(cleanText('Tủ > Kệ', 80)).toBe('Tủ Kệ');
    expect(cleanText('1 < 2', 80)).toBe('1 2');
    expect(cleanText('x'.repeat(600), FILE_LIMITS.maxNote)).toHaveLength(FILE_LIMITS.maxNote);
    expect(cleanText(42, 10)).toBe('');
  });
});

/* ---------- Nhập file ---------- */

const emptyWalls = () => ({ T: [], R: [], B: [], L: [] });
const roomJson = (extra: Record<string, unknown> = {}) => ({ W: 400, H: 350, ceil: 270, floor: '#e2c9a4', wall: '#f1eee6', items: [], walls: emptyWalls(), ...extra });
const fileJson = (rooms: Record<string, unknown>, extra: Record<string, unknown> = {}) => JSON.stringify({ app: FILE_APP, ver: CURRENT_VER, units: 'cm', scope: 'all', rooms, ...extra });
const floorItem = (extra: Record<string, unknown> = {}) => ({ id: 'bed2', name: 'Giường đôi', x: 200, y: 115, rot: 0, color: '#8fb4d9', ...extra });
const wallItem = (extra: Record<string, unknown> = {}) => ({ id: 'ac', name: 'Máy lạnh', x: 175, y: 220, color: '#e8ecee', ...extra });

function parseOk(text: string, reg = registry) {
  const r = parseDesignFile(text, reg);
  if (!r.ok) throw new Error(`mong đợi nhập được, nhưng gặp lỗi: ${r.error.code} ${r.error.detail ?? ''}`);
  return r.file;
}
function parseFail(text: string, reg = registry) {
  const r = parseDesignFile(text, reg);
  if (r.ok) throw new Error('mong đợi lỗi, nhưng nhập được');
  return r.error;
}
const warningCodes = (f: ReturnType<typeof parseOk>) => f.warnings.map((w) => w.code).sort();

describe('nhập file: vòng xuất rồi nhập', () => {
  it('toàn bộ bố trí mẫu đi qua file rồi quay lại giống hệt (trừ uid)', () => {
    const layouts = sampleLayouts();
    const text = serializeFile(buildFile(layouts, { scope: 'all', room: 'ngu', name: 'Thử', now: NOW }));
    const f = parseOk(text);
    expect(f.warnings).toEqual([]);
    expect(f.name).toBe('Thử');
    expect(f.scope).toBe('all');
    expect(f.rooms.map((r) => r.id)).toEqual([...ROOM_IDS]);
    for (const r of f.rooms) {
      expect(withoutUid(r.layout)).toEqual(withoutUid(layouts[r.id]));
      expect(r.itemCount).toBe(countItems(layouts[r.id]));
    }
  });

  it('file đẹp, thụt 2 khoảng trắng, không chứa uid, nhỏ gọn', () => {
    const text = serializeFile(buildFile(sampleLayouts(), { scope: 'all', room: 'ngu', now: NOW }));
    expect(text.startsWith('{\n  "app": "xepnha2d"')).toBe(true);
    expect(text).not.toContain('uid');
    expect(text.length).toBeLessThan(60_000);
  });

  it('layoutFromImported gán uid mới, không trùng, không đổi bản đã đọc', () => {
    const f = parseOk(fileJson({ ngu: roomJson({ items: [floorItem(), floorItem({ x: 300 })], walls: { ...emptyWalls(), L: [wallItem()] } }) }));
    const room = f.rooms[0]!;
    let n = 500;
    const l = layoutFromImported(room, () => ++n);
    expect(l.items.map((i) => i.uid)).toEqual([501, 502]);
    expect(l.walls.L[0]!.uid).toBe(503);
    // file không ghi cửa thì dùng cửa mặc định của phòng ngủ (một cửa đi, một cửa sổ), cũng được gán uid
    expect([l.doors[0]!.uid, l.windows[0]!.uid]).toEqual([504, 505]);
    expect(room.layout.items.every((i) => i.uid === 0)).toBe(true);
    expect(room.layout.doors.every((o) => o.uid === 0)).toBe(true);
    expect(maxUid({ ngu: l })).toBe(505);
  });
});

describe('nhập file: lỗi không nhập được (bản vẽ hiện tại không bị đụng tới)', () => {
  it('không phải JSON', () => {
    const e = parseFail('xin chào');
    expect(e.code).toBe('not-json');
    expect(e.title).toBe('Không đọc được file này');
  });

  it('JSON nhưng không phải bản thiết kế của trang', () => {
    for (const text of ['[]', 'null', '42', '"x"', '{}', JSON.stringify({ app: 'khac', ver: 3, rooms: {} }), JSON.stringify({ app: FILE_APP, rooms: {} }), JSON.stringify({ app: FILE_APP, ver: 3 })]) {
      expect(parseFail(text).code).toBe('invalid');
    }
    expect(parseFail(fileJson({}, { ver: 0 })).code).toBe('invalid');
    expect(parseFail(fileJson({}, { ver: 2.5 })).code).toBe('invalid');
    expect(parseFail(fileJson({}, { ver: '3' })).code).toBe('invalid');
    expect(parseFail(fileJson({ ngu: roomJson() }, { units: 'inch' })).code).toBe('invalid');
  });

  it('lỗi chung có hướng dẫn tiếp theo và lời trấn an', () => {
    const e = parseFail('[]');
    expect(e.message).toContain('Bản vẽ của bạn chưa bị thay đổi');
    expect(e.detail).toBeTruthy();
  });

  it('file từ bản mới hơn thì bảo tải lại trang', () => {
    const e = parseFail(fileJson({ ngu: roomJson() }, { ver: CURRENT_VER + 1 }));
    expect(e.code).toBe('newer');
    expect(e.title).toBe('File tạo từ bản mới hơn');
    expect(e.message).toContain('Hãy tải lại trang');
  });

  it('file quá 2 MB bị từ chối trước khi đọc', () => {
    const e = parseFail('a'.repeat(FILE_LIMITS.maxBytes + 1));
    expect(e.code).toBe('too-large');
  });

  it('quá 500 món một phòng bị từ chối', () => {
    const items = Array.from({ length: FILE_LIMITS.maxItemsPerRoom + 1 }, (_, i) => floorItem({ x: 100 + (i % 50) }));
    const e = parseFail(fileJson({ ngu: roomJson({ items }) }));
    expect(e.code).toBe('too-many');
    expect(parseOk(fileJson({ ngu: roomJson({ items: items.slice(0, FILE_LIMITS.maxItemsPerRoom) }) })).rooms[0]!.itemCount).toBe(FILE_LIMITS.maxItemsPerRoom);
  });

  it('quá 500 món một phòng tính cả đồ tường', () => {
    const items = Array.from({ length: 300 }, () => floorItem());
    const walls = { ...emptyWalls(), T: Array.from({ length: 150 }, () => wallItem()), L: Array.from({ length: 51 }, () => wallItem()) };
    expect(parseFail(fileJson({ ngu: roomJson({ items, walls }) })).code).toBe('too-many');
    expect(parseOk(fileJson({ ngu: roomJson({ items, walls: { ...walls, L: walls.L.slice(0, 50) } }) })).rooms[0]!.itemCount).toBe(500);
  });

  it('phòng sai cấu trúc', () => {
    expect(parseFail(fileJson({ ngu: 5 })).code).toBe('invalid');
    expect(parseFail(fileJson({ ngu: roomJson({ items: 'x' }) })).code).toBe('invalid');
    expect(parseFail(fileJson({ ngu: roomJson({ walls: [] }) })).code).toBe('invalid');
    expect(parseFail(fileJson({ ngu: roomJson({ walls: { T: 5 } }) })).code).toBe('invalid');
  });

  it('chỉ có phòng lạ thì không có gì để nhập', () => {
    expect(parseFail(fileJson({ garage: roomJson(), __proto__x: roomJson() })).code).toBe('invalid');
  });
});

describe('nhập file: sửa nhẹ và báo cáo', () => {
  it('file tối thiểu: thiếu walls, items thì coi như trống', () => {
    const f = parseOk(fileJson({ ngu: { W: 400, H: 350, ceil: 270, floor: '#e2c9a4', wall: '#f1eee6' } }));
    expect(f.warnings).toEqual([]);
    expect(f.rooms[0]!.layout.items).toEqual([]);
    expect(WALL_KEYS.every((w) => f.rooms[0]!.layout.walls[w].length === 0)).toBe(true);
  });

  it('kích thước phòng ngoài khoảng được kẹp về giới hạn; thiếu hoặc sai kiểu thì dùng kích thước mặc định', () => {
    const f = parseOk(fileJson({ ngu: roomJson({ W: 99999, H: 20, ceil: 'cao' }) }));
    const l = f.rooms[0]!.layout;
    expect(l.W).toBe(LIMITS.roomW.max);
    expect(l.H).toBe(LIMITS.roomH.min);
    expect(l.ceil).toBe(ROOMS.ngu.ceil);
    expect(f.warnings).toEqual([expect.objectContaining({ code: 'room-clamped', count: 3 })]);
  });

  it('số lẻ của phòng được làm tròn mà không cảnh báo', () => {
    const f = parseOk(fileJson({ ngu: roomJson({ W: 400.4, H: 350.6 }) }));
    expect(f.rooms[0]!.layout.W).toBe(400);
    expect(f.rooms[0]!.layout.H).toBe(351);
    expect(f.warnings).toEqual([]);
  });

  it('màu sai thì dùng màu mặc định và báo; không ghi màu thì dùng mặc định, không báo', () => {
    const f = parseOk(fileJson({ ngu: roomJson({ floor: 'xanh', wall: 123, items: [floorItem({ color: 'red' }), floorItem({ color: undefined })] }) }));
    const l = f.rooms[0]!.layout;
    const def = registry.get('bed2')!;
    expect(l.items[0]!.color).toBe(def.color.toLowerCase());
    expect(l.items[1]!.color).toBe(def.color.toLowerCase());
    expect(l.floor).toMatch(/^#[0-9a-f]{6}$/);
    expect(l.wall).toMatch(/^#[0-9a-f]{6}$/);
    expect(f.warnings.find((w) => w.code === 'color-reset')!.count).toBe(3);
  });

  it('mã màu 3 ký tự và chữ hoa được chuẩn hóa', () => {
    const f = parseOk(fileJson({ ngu: roomJson({ floor: '#ABC', items: [floorItem({ color: '#8FB4D9' })] }) }));
    expect(f.rooms[0]!.layout.floor).toBe('#aabbcc');
    expect(f.rooms[0]!.layout.items[0]!.color).toBe('#8fb4d9');
    expect(f.warnings).toEqual([]);
  });

  it('số đo và vị trí của món ngoài khoảng được kẹp lại', () => {
    const f = parseOk(fileJson({ ngu: roomJson({ items: [floorItem({ w: 5, d: 9999, x: 1e9, y: -1e9 })] }) }));
    const it = f.rooms[0]!.layout.items[0]!;
    expect(it.w).toBe(LIMITS.itemSize.min);
    expect(it.d).toBe(LIMITS.itemSize.max);
    expect(it.x).toBe(FILE_LIMITS.maxCoord);
    expect(it.y).toBe(-FILE_LIMITS.maxCoord);
    expect(f.warnings).toEqual([expect.objectContaining({ code: 'item-clamped', count: 4 })]);
  });

  it('góc xoay được đưa về 0 đến 360; sai kiểu thì về 0', () => {
    const f = parseOk(fileJson({ ngu: roomJson({ items: [floorItem({ rot: 450 }), floorItem({ rot: -90 }), floorItem({ rot: 'x' }), floorItem({ rot: 33.33 })] }) }));
    expect(f.rooms[0]!.layout.items.map((i) => i.rot)).toEqual([90, 270, 0, 33.3]);
  });

  it('món gắn tường: độ cao mép dưới kẹp trong 0 đến 400, thiếu thì lấy theo thư viện', () => {
    const f = parseOk(fileJson({ ngu: roomJson({ walls: { ...emptyWalls(), L: [wallItem({ y: 999 }), wallItem({ y: undefined })], T: [wallItem({ y: -5 })] } }) }));
    const l = f.rooms[0]!.layout;
    expect(l.walls.L[0]!.y).toBe(LIMITS.itemY.max);
    expect(l.walls.L[1]!.y).toBe(registry.get('ac')!.y);
    expect(l.walls.T[0]!.y).toBe(LIMITS.itemY.min);
    expect(f.warnings).toEqual([expect.objectContaining({ code: 'item-clamped', count: 2 })]);
  });

  it('món lạ có đủ tên và kích thước thì giữ làm món tùy chỉnh, kể cả chiều cao', () => {
    const f = parseOk(fileJson({ ngu: roomJson({ items: [floorItem({ id: 'sofaLa', name: 'Sofa <i>lạ</i>', w: 200, d: 90, h: 80, color: '#112233' })], walls: { ...emptyWalls(), R: [wallItem({ id: 'keLa', name: 'Kệ lạ', w: 80, h: 30, d: 25 })] } }) }));
    const l = f.rooms[0]!.layout;
    expect(l.items[0]).toMatchObject({ id: 'sofaLa', name: 'Sofa lạ', w: 200, d: 90, h: 80, color: '#112233', z: 1 });
    expect(l.walls.R[0]).toMatchObject({ id: 'keLa', name: 'Kệ lạ', w: 80, h: 30, d: 25 });
    expect(warningCodes(f)).toEqual(['custom-items']);
    expect(f.warnings[0]!.count).toBe(2);
  });

  it('món lạ thiếu tên hoặc kích thước thì bỏ và báo', () => {
    const f = parseOk(
      fileJson({
        ngu: roomJson({
          items: [floorItem({ id: 'la1', name: 'Không rộng', w: undefined, d: 50 }), floorItem({ id: 'la2', name: '', w: 50, d: 50 }), floorItem({ x: 'a' }), 5, null, { id: 7 }, floorItem()],
        }),
      }),
    );
    expect(f.rooms[0]!.layout.items).toHaveLength(1);
    expect(f.warnings).toEqual([expect.objectContaining({ code: 'items-dropped', count: 6 })]);
  });

  it('món nằm sai loại (đồ sàn trong danh sách tường và ngược lại) bị bỏ', () => {
    const f = parseOk(fileJson({ ngu: roomJson({ items: [floorItem({ id: 'ac' })], walls: { ...emptyWalls(), T: [wallItem({ id: 'bed2' })] } }) }));
    expect(f.rooms[0]!.itemCount).toBe(0);
    expect(f.warnings).toEqual([expect.objectContaining({ code: 'items-dropped', count: 2 })]);
  });

  it('món đã ngừng dùng được đổi sang món thay thế và báo', () => {
    const bed = registry.get('bed2')!;
    const old: ItemDef = { ...bed, id: 'bedCu', status: 'retired', replacedBy: 'bed2' };
    const reg = createRegistry([...registry.items, old], CATEGORIES);
    const f = parseOk(fileJson({ ngu: roomJson({ items: [floorItem({ id: 'bedCu', name: 'Giường cũ' })] }) }), reg);
    const it = f.rooms[0]!.layout.items[0]!;
    expect(it.id).toBe('bed2');
    expect(it.name).toBe(bed.name);
    expect(f.warnings).toEqual([expect.objectContaining({ code: 'replaced', count: 1 })]);
  });

  it('món trong thư viện lấy tên, màu lớp vẽ theo thư viện; không để file đổi tên hay lớp vẽ', () => {
    const rug = registry.live('floor').find((i) => i.layer === 'under');
    expect(rug).toBeDefined();
    const f = parseOk(fileJson({ khach: roomJson({ items: [floorItem({ id: rug!.id, name: 'Tên khác', z: 1 })] }) }));
    const it = f.rooms[0]!.layout.items[0]!;
    expect(it.name).toBe(rug!.name);
    expect(it.z).toBe(0);
  });

  it('cờ khóa chỉ nhận giá trị true thật', () => {
    const f = parseOk(fileJson({ ngu: roomJson({ items: [floorItem({ locked: true }), floorItem({ locked: 'true' }), floorItem({ locked: 1 })] }) }));
    expect(f.rooms[0]!.layout.items.map((i) => i.locked)).toEqual([true, undefined, undefined]);
  });

  it('phòng lạ bị bỏ qua và báo, phòng quen vẫn nhập; thứ tự phòng theo thứ tự tab', () => {
    const f = parseOk(fileJson({ garage: roomJson(), wc: roomJson(), ngu: roomJson() }));
    expect(f.rooms.map((r) => r.id)).toEqual(['ngu', 'wc']);
    expect(f.warnings).toEqual([expect.objectContaining({ code: 'unknown-room', count: 1 })]);
  });

  it('tên, ghi chú, ngày xuất và phạm vi: làm sạch và dùng giá trị mặc định khi sai', () => {
    const f = parseOk(fileJson({ ngu: roomJson() }, { name: '  <b>Nhà</b>\u0000  mới ', note: 'n'.repeat(900), exportedAt: 123, scope: 'khac' }));
    expect(f.name).toBe('Nhà mới');
    expect(f.note).toHaveLength(FILE_LIMITS.maxNote);
    expect(f.exportedAt).toBeNull();
    expect(f.scope).toBe('all');
    expect(parseOk(fileJson({ ngu: roomJson() }, { scope: 'room', exportedAt: '2026-10-20T10:05:09+07:00' })).scope).toBe('room');
  });

  it('khóa __proto__ trong file không làm ô nhiễm đối tượng', () => {
    const text = `{"app":"xepnha2d","ver":3,"rooms":{"__proto__":{"polluted":true},"ngu":${JSON.stringify(roomJson())}}}`;
    const f = parseOk(text);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(f.rooms.map((r) => r.id)).toEqual(['ngu']);
    expect(f.warnings).toEqual([expect.objectContaining({ code: 'unknown-room', count: 1 })]);
  });

  it('file bản 2 được nâng lên: màu tường làm nhạt', () => {
    const f = parseOk(fileJson({ ngu: roomJson({ wall: '#5c6b66' }) }, { ver: 2 }));
    expect(f.rooms[0]!.layout.wall).toBe(hexMix('#5c6b66', 0.82));
  });

  it('thông điệp cảnh báo viết sẵn bằng tiếng Việt, kèm số lượng', () => {
    const f = parseOk(fileJson({ ngu: roomJson({ W: 9999, items: [floorItem({ w: 1 })] }) }));
    for (const w of f.warnings) {
      expect(w.message).toContain(String(w.count));
      expect(w.message.length).toBeGreaterThan(20);
    }
  });
});

describe('nhập file: một phòng, đủ điều kiện dùng ngay', () => {
  it('layout nhập vào dùng được cho isUsableLayout và không chia sẻ tham chiếu với bản đã đọc', async () => {
    const { isUsableLayout } = await import('../src/core/layout');
    const f = parseOk(fileJson({ bep: roomJson({ items: [floorItem()] }) }));
    const a = layoutFromImported(f.rooms[0]!, nextUid);
    const b = layoutFromImported(f.rooms[0]!, nextUid);
    expect(isUsableLayout(a)).toBe(true);
    a.items[0]!.x = 1;
    expect(b.items[0]!.x).toBe(200);
    expect(f.rooms[0]!.layout.items[0]!.x).toBe(200);
  });

  it('mọi RoomId đều nhận được', () => {
    const rooms = Object.fromEntries(ROOM_IDS.map((id) => [id, roomJson()]));
    const f = parseOk(fileJson(rooms));
    expect(f.rooms.map((r) => r.id as RoomId)).toEqual([...ROOM_IDS]);
  });
});

/* ---------- Cửa đi, cửa sổ ---------- */

describe('cửa đi và cửa sổ trong file và dữ liệu tự lưu', () => {
  const door = (extra: Record<string, unknown> = {}) => ({ wall: 'B', pos: 30, w: 80, ...extra });
  const strip = <T extends { uid: number }>(list: T[]) => list.map(({ uid: _uid, ...rest }) => rest);

  it('file xuất ghi cửa (không có uid); dời cửa rồi xuất, nhập lại vẫn đúng chỗ', () => {
    const layouts = sampleLayouts();
    layouts.ngu.doors[0]!.wall = 'L';
    layouts.ngu.doors[0]!.pos = 120;
    const text = serializeFile(buildFile(layouts, { scope: 'room', room: 'ngu', now: NOW }));
    const json = JSON.parse(text) as { rooms: { ngu: { doors: unknown[]; windows: unknown[] } } };
    expect(json.rooms.ngu.doors).toEqual([{ wall: 'L', pos: 120, w: 80 }]);
    expect(json.rooms.ngu.windows).toEqual([{ wall: 'T', pos: 110, w: 180 }]);
    expect(text).not.toContain('uid');
    const f = parseOk(text);
    expect(f.warnings).toEqual([]);
    expect(f.rooms[0]!.layout.doors).toEqual([{ uid: 0, wall: 'L', pos: 120, w: 80 }]);
  });

  it('file không ghi cửa (bản cũ) thì dùng cửa mặc định của phòng, không cảnh báo', () => {
    const f = parseOk(fileJson({ ngu: roomJson(), bep: roomJson({ W: 320, H: 320 }) }));
    expect(f.warnings).toEqual([]);
    expect(strip(f.rooms[0]!.layout.doors)).toEqual(ROOMS.ngu.doors);
    expect(strip(f.rooms[0]!.layout.windows)).toEqual(ROOMS.ngu.windows);
    expect(strip(f.rooms[1]!.layout.doors)).toEqual(ROOMS.bep.doors);
  });

  it('file ghi danh sách rỗng thì phòng không có cửa (tin vào file)', () => {
    const f = parseOk(fileJson({ ngu: roomJson({ doors: [], windows: [] }) }));
    expect(f.rooms[0]!.layout.doors).toEqual([]);
    expect(f.rooms[0]!.layout.windows).toEqual([]);
    expect(f.warnings).toEqual([]);
  });

  it('mục sai thì bỏ, số ngoài khoảng thì kéo vào tường, cả hai đều báo một dòng', () => {
    const f = parseOk(
      fileJson({
        ngu: roomJson({
          doors: [door(), { wall: 'X', pos: 1, w: 80 }, { wall: 'T', pos: 'a', w: 80 }, 'rác', null],
          windows: [{ wall: 'R', pos: -50, w: 9999, sill: 'x', h: 5000 }],
        }),
      }),
    );
    const l = f.rooms[0]!.layout;
    expect(strip(l.doors)).toEqual([door()]);
    // tường phải dài 350: rộng tối đa 340, chừa mép 5; cao không vượt trần 270; sill không phải số thì để mặc định
    expect(strip(l.windows)).toEqual([{ wall: 'R', pos: 5, w: 340, h: 270 }]);
    expect(f.warnings.map((w) => [w.code, w.count])).toEqual([['openings-fixed', 5]]);
  });

  it('cửa sổ: bậu và chiều cao bị kẹp theo trần phòng, làm tròn thành số nguyên', () => {
    const f = parseOk(fileJson({ ngu: roomJson({ windows: [{ wall: 'T', pos: 100.4, w: 120.6, sill: 400, h: 100 }] }) }));
    const w = f.rooms[0]!.layout.windows[0]!;
    expect([w.pos, w.w]).toEqual([100, 121]);
    expect(w.sill).toBe(260); // trần 270 trừ 10
    expect(w.h).toBe(10);
  });

  it('quá nhiều cửa thì giữ phần đầu và báo phần dư', () => {
    const f = parseOk(fileJson({ ngu: roomJson({ doors: Array.from({ length: 15 }, (_, i) => door({ pos: 5 + i * 20, w: 30 })) }) }));
    expect(f.rooms[0]!.layout.doors).toHaveLength(12);
    expect(f.warnings.map((w) => [w.code, w.count])).toEqual([['openings-fixed', 3]]);
  });

  it('trường doors không phải danh sách thì dùng cửa mặc định và báo', () => {
    const f = parseOk(fileJson({ ngu: roomJson({ doors: 5 }) }));
    expect(strip(f.rooms[0]!.layout.doors)).toEqual(ROOMS.ngu.doors);
    expect(warningCodes(f)).toEqual(['openings-fixed']);
  });

  it('thu nhỏ phòng trong file thì cửa cũng được kéo vào tường', () => {
    const f = parseOk(fileJson({ ngu: roomJson({ W: 200, windows: [{ wall: 'T', pos: 110, w: 180 }] }) }));
    expect(f.rooms[0]!.layout.windows[0]).toMatchObject({ wall: 'T', pos: 15, w: 180 });
    expect(warningCodes(f)).toEqual(['openings-fixed']);
  });

  it('dữ liệu tự lưu của bản cũ (chưa có doors, windows) đọc lại có cửa mặc định', () => {
    const raw = JSON.parse(JSON.stringify({ ver: 3, room: 'ngu', layouts: sampleLayouts() })) as { layouts: Record<string, Record<string, unknown>> };
    for (const l of Object.values(raw.layouts)) {
      delete l.doors;
      delete l.windows;
    }
    const s = load(memoryKV({ [STATE_KEY]: JSON.stringify(raw) }))!;
    for (const id of ROOM_IDS) {
      expect(strip(s.layouts[id]!.doors)).toEqual(ROOMS[id].doors);
      expect(strip(s.layouts[id]!.windows)).toEqual(ROOMS[id].windows);
    }
  });

  it('cửa đã dời được tự lưu rồi đọc lại đúng chỗ, mỗi cửa có uid mới', () => {
    const layouts = sampleLayouts();
    moveOpening(layouts.khach, layouts.khach.windows[0]!, 'T', 200, true);
    const kv = memoryKV();
    saveState(kv, 'khach', layouts, { color: '#e3b7a0', recent: [] });
    uid = 5000;
    const s = load(kv)!;
    expect(strip(s.layouts.khach!.windows)).toEqual([{ wall: 'T', pos: 200, w: 180 }]);
    expect(s.layouts.khach!.windows[0]!.uid).toBeGreaterThanOrEqual(5000);
  });

  it('hướng mở cánh đi qua file: chỉ ghi giá trị khác mặc định, giá trị lạ thì bỏ', () => {
    const layouts = sampleLayouts();
    flipDoorHinge(layouts.ngu.doors[0]!);
    toggleDoorSwing(layouts.ngu.doors[0]!);
    const json = JSON.parse(serializeFile(buildFile(layouts, { scope: 'all', room: 'ngu', now: NOW }))) as { rooms: Record<string, { doors: unknown[] }> };
    expect(json.rooms.ngu!.doors).toEqual([{ wall: 'B', pos: 30, w: 80, hinge: 'end', swing: 'out' }]);
    expect(json.rooms.khach!.doors).toEqual([{ wall: 'B', pos: 40, w: 90 }]);
    const f = parseOk(JSON.stringify({ app: FILE_APP, ver: CURRENT_VER, units: 'cm', scope: 'all', rooms: Object.fromEntries(Object.entries(json.rooms).map(([k, v]) => [k, { ...roomJson(), ...v }])) }));
    expect(f.warnings).toEqual([]);
    expect(f.rooms[0]!.layout.doors[0]).toMatchObject({ wall: 'B', pos: 30, w: 80, hinge: 'end', swing: 'out' });
    const odd = parseOk(fileJson({ ngu: roomJson({ doors: [door({ hinge: 'middle', swing: 5 }), door({ pos: 150, hinge: 'start', swing: 'in' })] }) }));
    expect(strip(odd.rooms[0]!.layout.doors)).toEqual([door(), door({ pos: 150 })]);
    expect(odd.warnings).toEqual([]);
  });

  it('cửa sổ không có hướng mở cánh: hinge, swing trong file bị bỏ', () => {
    const f = parseOk(fileJson({ ngu: roomJson({ windows: [{ wall: 'T', pos: 100, w: 100, hinge: 'end', swing: 'out' }] }) }));
    expect(strip(f.rooms[0]!.layout.windows)).toEqual([{ wall: 'T', pos: 100, w: 100 }]);
  });

  it('Hoàn tác khôi phục hướng mở cánh', () => {
    const layouts = sampleLayouts();
    const h = new History();
    h.reset(layouts);
    toggleDoorSwing(layouts.ngu.doors[0]!);
    expect(h.commit('ngu', layouts.ngu, false)).toBe(true);
    expect(h.undo('ngu')!.doors[0]!.swing).toBeUndefined();
    expect(h.redo('ngu')!.doors[0]!.swing).toBe('out');
  });

  it('bản 3 lên bản 4: chỉ tăng số bản, giữ nguyên phần còn lại', () => {
    const doc = { ver: 3, name: 'x', rooms: { ngu: { W: 400 } } };
    const out = migrate(doc);
    expect(out.from).toBe(3);
    expect(out.doc).toEqual({ ...doc, ver: 4 });
    expect(CURRENT_VER).toBe(4);
  });

  it('Hoàn tác và Làm lại khôi phục chỗ cũ của cửa', () => {
    const layouts = sampleLayouts();
    const h = new History();
    h.reset(layouts);
    moveOpening(layouts.ngu, layouts.ngu.doors[0]!, 'L', 100, true);
    expect(h.commit('ngu', layouts.ngu, false)).toBe(true);
    const back = h.undo('ngu')!;
    expect(back.doors[0]).toMatchObject({ wall: 'B', pos: 30, w: 80 });
    expect(h.redo('ngu')!.doors[0]).toMatchObject({ wall: 'L', pos: 100 });
  });
});

/* ---------- Vị trí các phòng trong mô hình căn hộ ---------- */

describe('vị trí các phòng trong căn hộ (tự lưu và file)', () => {
  const pen = { color: '#e3b7a0', recent: [] as string[] };

  it('sanitizeApt: giữ phòng hợp lệ, làm tròn, kẹp, bỏ mục sai', () => {
    expect(sanitizeApt({ ngu: { x: 10.6, y: -20.4 }, khach: { x: 99999, y: -99999 }, bep: { x: 'a', y: 1 }, wc: 5, 'Garage 1': { x: 1, y: 2 } })).toEqual({
      ngu: { x: 11, y: -20 },
      khach: { x: 10000, y: -10000 },
    });
    // có danh sách mã thì chỉ giữ mã trong danh sách (phòng thêm sau có mã tự đặt)
    expect(sanitizeApt({ ngu: { x: 1, y: 2 }, ngu2: { x: 3, y: 4 }, khach: { x: 5, y: 6 } }, ['ngu', 'ngu2'])).toEqual({ ngu: { x: 1, y: 2 }, ngu2: { x: 3, y: 4 } });
    expect(sanitizeApt(null)).toEqual({});
    expect(sanitizeApt([1, 2])).toEqual({});
    expect(sanitizeApt('x')).toEqual({});
    expect(sanitizeApt({ ngu: { x: Number.NaN, y: 0 } })).toEqual({});
  });

  it('tự lưu rồi đọc lại đúng vị trí; chưa chỉnh thì không ghi trường apt', () => {
    const layouts = sampleLayouts();
    const kv = memoryKV();
    saveState(kv, 'ngu', layouts, pen, undefined, { ngu: { x: 700, y: -50 }, wc: { x: 0, y: 900 } });
    expect(load(kv)!.apt).toEqual({ ngu: { x: 700, y: -50 }, wc: { x: 0, y: 900 } });
    expect(JSON.parse(serializeState('ngu', layouts, pen)).apt).toBeUndefined();
    expect(JSON.parse(serializeState('ngu', layouts, pen, undefined, {})).apt).toBeUndefined();
    const kv2 = memoryKV();
    saveState(kv2, 'ngu', layouts, pen);
    expect(load(kv2)!.apt).toEqual({});
  });

  it('dữ liệu tự lưu cũ (chưa có apt) đọc lại được, vị trí rỗng', () => {
    const raw = JSON.parse(JSON.stringify({ ver: CURRENT_VER, room: 'ngu', layouts: sampleLayouts() }));
    expect(load(memoryKV({ [STATE_KEY]: JSON.stringify(raw) }))!.apt).toEqual({});
  });

  it('vị trí hỏng trong dữ liệu tự lưu thì bỏ, không làm hỏng cả bản vẽ', () => {
    const raw = JSON.parse(JSON.stringify({ ver: CURRENT_VER, room: 'ngu', layouts: sampleLayouts(), apt: { ngu: { x: 'oops' }, bep: { x: 5, y: 6 } } }));
    const s = load(memoryKV({ [STATE_KEY]: JSON.stringify(raw) }))!;
    expect(s.apt).toEqual({ bep: { x: 5, y: 6 } });
    expect(Object.keys(s.layouts)).toHaveLength(4);
  });

  it('xuất cả căn: file ghi apartment; xuất một phòng hoặc chưa chỉnh thì không ghi', () => {
    const layouts = sampleLayouts();
    const apt = { ngu: { x: 1, y: 2 }, khach: { x: 3, y: 4 } };
    expect(buildFile(layouts, { scope: 'all', room: 'ngu', now: NOW, apt }).apartment).toEqual(apt);
    expect(buildFile(layouts, { scope: 'room', room: 'ngu', now: NOW, apt }).apartment).toBeUndefined();
    expect(buildFile(layouts, { scope: 'all', room: 'ngu', now: NOW }).apartment).toBeUndefined();
    expect(buildFile(layouts, { scope: 'all', room: 'ngu', now: NOW, apt: {} }).apartment).toBeUndefined();
  });

  it('nhập file: đọc lại apartment (đã làm sạch); file không có thì rỗng', () => {
    const layouts = sampleLayouts();
    const apt = { ngu: { x: 700, y: -50 }, wc: { x: 12, y: 34 } };
    const text = serializeFile(buildFile(layouts, { scope: 'all', room: 'ngu', now: NOW, apt }));
    expect(text).toContain('"apartment"');
    const f = parseOk(text);
    expect(f.apt).toEqual(apt);
    expect(f.warnings).toEqual([]);
    expect(parseOk(fileJson({ ngu: roomJson() })).apt).toEqual({});
    // chỉ giữ vị trí của phòng có trong file; số hỏng thì bỏ
    expect(parseOk(fileJson({ ngu: roomJson(), bep: roomJson() }, { apartment: { ngu: { x: 1e9, y: 'x' }, bep: { x: 1, y: 2 }, wc: { x: 3, y: 4 } } })).apt).toEqual({ bep: { x: 1, y: 2 } });
  });
});

/* ---------- Danh sách phòng của căn hộ (thêm, xóa, đổi tên phòng) ---------- */

describe('danh sách phòng của căn hộ', () => {
  const pen = { color: '#e3b7a0', recent: [] as string[] };
  /** Căn hộ có hai phòng ngủ, một phòng làm việc, không có bếp và vệ sinh. */
  const custom: RoomEntry[] = [
    { id: 'khach', type: 'khach', name: 'Phòng khách' },
    { id: 'ngu', type: 'ngu', name: 'Phòng ngủ chính' },
    { id: 'ngu2', type: 'ngu', name: 'Phòng con' },
    { id: 'lamviec', type: 'lamviec', name: 'Phòng làm việc' },
  ];
  const customLayouts = (): Layouts => {
    uid = 1;
    return Object.fromEntries(custom.map((e) => [e.id, freshLayout({ ...ROOMS[e.type], id: e.id, name: e.name }, registry, nextUid)])) as Layouts;
  };

  it('sanitizeRoomList: giữ mục hợp lệ, bỏ mã trùng, loại lạ, mã hỏng; tên thiếu thì lấy tên loại', () => {
    const out = sanitizeRoomList([
      { id: 'ngu', type: 'ngu', name: '  Phòng <b>con</b> ' },
      { id: 'ngu', type: 'bep', name: 'trùng mã' },
      { id: 'x1', type: 'garage', name: 'loại lạ' },
      { id: 'Bad Id', type: 'ngu', name: 'mã hỏng' },
      { id: 'bep', type: 'bep' },
      'xyz',
      null,
    ]);
    expect(out).toEqual([
      { id: 'ngu', type: 'ngu', name: 'Phòng con' },
      { id: 'bep', type: 'bep', name: ROOMS.bep.name },
    ]);
  });

  it('sanitizeRoomList: không phải mảng hoặc không còn mục nào thì null; quá giới hạn thì cắt', () => {
    expect(sanitizeRoomList(undefined)).toBeNull();
    expect(sanitizeRoomList({})).toBeNull();
    expect(sanitizeRoomList([])).toBeNull();
    expect(sanitizeRoomList([{ id: 'A', type: 'ngu' }])).toBeNull();
    const many = Array.from({ length: LIMITS.maxRooms + 5 }, (_, i) => ({ id: `p${i}`, type: 'trong', name: `P${i}` }));
    expect(sanitizeRoomList(many)).toHaveLength(LIMITS.maxRooms);
  });

  it('sanitizeRoomList: tên quá dài bị cắt', () => {
    const [r] = sanitizeRoomList([{ id: 'ngu', type: 'ngu', name: 'x'.repeat(500) }])!;
    expect(r!.name.length).toBeLessThanOrEqual(40);
  });

  it('tự lưu rồi đọc lại đúng danh sách, bố cục từng phòng, phòng đang mở và vị trí', () => {
    const kv = memoryKV();
    const layouts = customLayouts();
    layouts.ngu2.items[0]!.x = 77;
    saveState(kv, 'ngu2', layouts, pen, undefined, { ngu2: { x: 5, y: 6 }, khach: { x: 0, y: 0 } }, custom);
    const s = load(kv)!;
    expect(s.rooms).toEqual(custom);
    expect(s.room).toBe('ngu2');
    expect(Object.keys(s.layouts).sort()).toEqual(custom.map((e) => e.id).sort());
    expect(s.layouts.ngu2!.items[0]!.x).toBe(77);
    expect(s.apt).toEqual({ ngu2: { x: 5, y: 6 }, khach: { x: 0, y: 0 } });
  });

  it('phòng đang mở không còn trong danh sách thì mở phòng đầu danh sách', () => {
    const kv = memoryKV();
    saveState(kv, 'bep', customLayouts(), pen, undefined, undefined, custom);
    expect(load(kv)!.room).toBe('khach');
  });

  it('dữ liệu tự lưu cũ (chưa có danh sách phòng) đọc lại thành bốn phòng mặc định', () => {
    const raw = JSON.stringify({ ver: CURRENT_VER, room: 'bep', layouts: sampleLayouts() });
    const s = load(memoryKV({ [STATE_KEY]: raw }))!;
    expect(s.rooms).toEqual(DEFAULT_ROOMS);
    expect(s.room).toBe('bep');
    expect(Object.keys(s.layouts).sort()).toEqual([...ROOM_IDS].sort());
  });

  it('bố cục của phòng mới (loại làm việc) được làm sạch theo cỡ của loại đó', () => {
    const kv = memoryKV();
    const layouts = customLayouts();
    saveState(kv, 'lamviec', layouts, pen, undefined, undefined, custom);
    const s = load(kv)!;
    expect(s.layouts.lamviec!.W).toBe(ROOMS.lamviec.W);
    expect(s.layouts.lamviec!.doors).toBeDefined();
  });

  it('danh sách hỏng thì dùng căn hộ mặc định, không làm mất bản vẽ', () => {
    const raw = JSON.stringify({ ver: CURRENT_VER, room: 'ngu', rooms: [{ id: 'Bad', type: 'ngu' }], layouts: sampleLayouts() });
    const s = load(memoryKV({ [STATE_KEY]: raw }))!;
    expect(s.rooms).toEqual(DEFAULT_ROOMS);
    expect(Object.keys(s.layouts)).toHaveLength(4);
  });

  it('xuất cả căn: file ghi roomList và đủ phòng; xuất một phòng chỉ ghi phòng đó', () => {
    const layouts = customLayouts();
    const all = buildFile(layouts, { scope: 'all', room: 'ngu', now: NOW, rooms: custom });
    expect(all.roomList).toEqual(custom);
    expect(Object.keys(all.rooms).sort()).toEqual(custom.map((e) => e.id).sort());
    const one = buildFile(layouts, { scope: 'room', room: 'ngu2', now: NOW, rooms: custom });
    expect(Object.keys(one.rooms)).toEqual(['ngu2']);
    expect(one.roomList).toEqual([custom[2]]);
  });

  it('xuất rồi nhập lại: giữ danh sách, thứ tự, tên và vị trí; bản vẽ giống hệt', () => {
    const layouts = customLayouts();
    const apt = { khach: { x: 0, y: 0 }, ngu2: { x: 900, y: 40 } };
    const text = serializeFile(buildFile(layouts, { scope: 'all', room: 'ngu', now: NOW, rooms: custom, apt }));
    const f = parseOk(text);
    expect(f.rooms.map((r) => r.entry)).toEqual(custom);
    expect(f.rooms.map((r) => r.id)).toEqual(custom.map((e) => e.id));
    expect(f.apt).toEqual(apt);
    expect(f.warnings).toEqual([]);
    for (const r of f.rooms) expect(withoutUid(r.layout)).toEqual(withoutUid(layouts[r.id]!));
  });

  it('file cũ (khóa là mã loại, không có roomList) vẫn nhập được thành các phòng mặc định theo thứ tự loại', () => {
    const f = parseOk(fileJson({ wc: roomJson(), ngu: roomJson() }));
    expect(f.rooms.map((r) => r.id)).toEqual(['ngu', 'wc']);
    expect(f.rooms.map((r) => r.entry)).toEqual([DEFAULT_ROOMS[0], DEFAULT_ROOMS[3]]);
  });

  it('khóa lạ không có trong roomList cũng không phải mã loại thì bỏ và báo', () => {
    const f = parseOk(fileJson({ ngu: roomJson(), garage: roomJson() }));
    expect(f.rooms.map((r) => r.id)).toEqual(['ngu']);
    expect(warningCodes(f)).toContain('unknown-room');
  });

  it('tóm tắt xuất: đếm theo danh sách phòng đang có', () => {
    const layouts = customLayouts();
    const all = summarizeExport(layouts, 'all', 'ngu', custom);
    expect(all.rooms).toBe(4);
    expect(all.items).toBe(custom.reduce((n, e) => n + countItems(layouts[e.id]!), 0));
    expect(summarizeExport(layouts, 'room', 'ngu2', custom).rooms).toBe(1);
  });
});

describe('lịch sử hoàn tác khi thêm và xóa phòng', () => {
  it('phòng mới có lịch sử riêng, bắt đầu từ bố cục lúc thêm', () => {
    const base = sampleLayouts();
    const h = new History();
    h.reset(base);
    const fresh = moved(base.ngu, 5);
    h.add('ngu2', fresh);
    expect(h.canUndo('ngu2')).toBe(false);
    expect(h.commit('ngu2', moved(fresh, 9), false)).toBe(true);
    expect(h.undo('ngu2')).toEqual(fresh);
    // phòng cũ không bị ảnh hưởng
    expect(h.canUndo('ngu')).toBe(false);
  });

  it('xóa phòng thì bỏ lịch sử: không ghi, không lùi được nữa', () => {
    const base = sampleLayouts();
    const h = new History();
    h.reset(base);
    expect(h.commit('ngu', moved(base.ngu, 1), false)).toBe(true);
    h.remove('ngu');
    expect(h.canUndo('ngu')).toBe(false);
    expect(h.undo('ngu')).toBeNull();
    expect(h.commit('ngu', moved(base.ngu, 2), false)).toBe(false);
  });

  it('lấy lại phòng đã xóa (add) thì lịch sử bắt đầu lại từ bố cục lấy lại', () => {
    const base = sampleLayouts();
    const h = new History();
    h.reset(base);
    h.remove('ngu');
    const back = moved(base.ngu, 42);
    h.add('ngu', back);
    expect(h.canUndo('ngu')).toBe(false);
    expect(h.commit('ngu', moved(back, 43), false)).toBe(true);
    expect(h.undo('ngu')).toEqual(back);
  });

  it('thao tác liên tục không gộp qua việc xóa rồi thêm lại phòng', () => {
    const c = clock();
    const base = sampleLayouts();
    const h = new History({ now: c.now });
    h.reset(base);
    h.commit('ngu', moved(base.ngu, 1), true);
    h.remove('ngu');
    h.add('ngu', base.ngu);
    c.tick(10);
    h.commit('ngu', moved(base.ngu, 2), true);
    c.tick(10);
    h.commit('ngu', moved(base.ngu, 3), true);
    // hai bước liên tục sát nhau gộp thành một, nhưng bước đầu sau khi thêm lại vẫn là một bước riêng
    expect(h.undo('ngu')).toEqual(base.ngu);
  });
});

describe('lịch sử: bước mới hay gộp bước', () => {
  it('lastWasNewStep: bước thường là bước mới; thao tác liên tục liền nhau thì gộp, không thêm bước', () => {
    const c = clock();
    const base = sampleLayouts();
    const h = new History({ now: c.now });
    h.reset(base);
    expect(h.commit('ngu', moved(base.ngu, 1), true)).toBe(true);
    expect(h.lastWasNewStep).toBe(true);
    c.tick(50);
    expect(h.commit('ngu', moved(base.ngu, 2), true)).toBe(true);
    expect(h.lastWasNewStep).toBe(false);
    c.tick(50);
    expect(h.commit('ngu', moved(base.ngu, 3), true)).toBe(true);
    expect(h.lastWasNewStep).toBe(false);
    // chỉ có một bước để lùi
    expect(h.undo('ngu')).toEqual(base.ngu);
    expect(h.canUndo('ngu')).toBe(false);
  });

  it('thao tác không liên tục luôn là bước mới; sang phòng khác cũng là bước mới', () => {
    const c = clock();
    const base = sampleLayouts();
    const h = new History({ now: c.now });
    h.reset(base);
    h.commit('ngu', moved(base.ngu, 1), true);
    c.tick(10);
    h.commit('ngu', moved(base.ngu, 2), false);
    expect(h.lastWasNewStep).toBe(true);
    c.tick(10);
    h.commit('khach', moved(base.khach, 5), true);
    expect(h.lastWasNewStep).toBe(true);
  });
});
