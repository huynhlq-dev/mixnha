import { normHex } from '../core/color';
import { clamp, normDeg } from '../core/geometry';
import { isUsableLayout } from '../core/layout';
import { LIMITS, ROOM_DIM_LIMITS, type RoomDimKey } from '../core/limits';
import type { Registry } from '../core/registry';
import { fitOpening } from '../core/room';
import type { AptPlan, DoorItem, FloorItem, Layout, WallItem, WindowItem } from '../core/types';
import { FLOOR_COLORS, WALL_COLORS } from '../data/palettes';
import { isRoomIdString, isRoomTypeId, MAX_ROOM_NAME } from '../core/rooms';
import { ROOMS, type RoomEntry, type RoomId } from '../data/rooms';
import type { OpeningDef, RoomDef, WallKey } from '../data/schema';
import { WALL_KEYS } from '../data/walls';

/**
 * Làm sạch dữ liệu bố trí từ nguồn không tin được: file người khác gửi, hoặc dữ liệu lưu trong trình duyệt.
 * Mọi bố trí đi vào ứng dụng đều qua đây, nên phần còn lại của code có thể tin rằng màu là #rrggbb,
 * số là số hữu hạn trong khoảng cho phép, tên là chữ thuần.
 */

export const FIELD_LIMITS = {
  maxName: 80,
  maxNote: 500,
  maxId: 64,
  maxItemName: 60,
  /** Tọa độ hợp lý lớn nhất của một món (cm). Xa hơn thì kéo về, để bản vẽ không vỡ vì số quá lớn. */
  maxCoord: 10000,
} as const;

const FALLBACK_ITEM_COLOR = '#b8bec4';

const r1 = (v: number): number => Math.round(v * 10) / 10;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Văn bản thuần: bỏ ký tự điều khiển, bỏ thẻ HTML, gọn khoảng trắng, cắt độ dài. Không bao giờ được chèn vào trang như mã HTML. */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/* ---------- Cảnh báo ---------- */

export type WarningCode = 'room-clamped' | 'item-clamped' | 'color-reset' | 'items-dropped' | 'unknown-room' | 'custom-items' | 'replaced' | 'openings-fixed';

export interface ImportWarning {
  code: WarningCode;
  count: number;
  message: string;
}

/** Gom số lần mỗi loại sự cố, để báo một dòng cho mỗi loại thay vì hàng trăm dòng. */
export class Tally {
  private m = new Map<WarningCode, number>();
  add(code: WarningCode, n = 1): void {
    this.m.set(code, (this.m.get(code) ?? 0) + n);
  }
  list(): ImportWarning[] {
    const text: Record<WarningCode, (n: number) => string> = {
      'room-clamped': (n) => `${n} số đo của phòng nằm ngoài khoảng cho phép nên đã chỉnh về giá trị gần nhất.`,
      'item-clamped': (n) => `${n} số đo hoặc vị trí của món nằm ngoài khoảng hợp lý nên đã chỉnh lại.`,
      'color-reset': (n) => `${n} màu không hợp lệ nên đã dùng màu mặc định.`,
      'items-dropped': (n) => `${n} món bị bỏ vì thiếu thông tin cần thiết (kích thước, vị trí) hoặc không đúng loại đặt.`,
      'unknown-room': (n) => `${n} phòng trong file không có trong trang này nên bị bỏ qua.`,
      'custom-items': (n) => `${n} món không có trong thư viện, giữ theo kích thước ghi trong file (món tùy chỉnh).`,
      replaced: (n) => `${n} món đã ngừng dùng, được thay bằng món mới trong thư viện.`,
      'openings-fixed': (n) => `${n} cửa đi hoặc cửa sổ có tường, vị trí hoặc số đo không hợp lệ nên đã chỉnh lại hoặc bỏ qua.`,
    };
    return [...this.m.entries()].map(([code, count]) => ({ code, count, message: text[code](count) }));
  }
}

/* ---------- Từng giá trị ---------- */

function clampSize(v: number, t: Tally): number {
  const c = clamp(v, LIMITS.itemSize.min, LIMITS.itemSize.max);
  if (c !== v) t.add('item-clamped');
  return c;
}

function clampCoord(v: number, t: Tally): number {
  const c = clamp(v, -FIELD_LIMITS.maxCoord, FIELD_LIMITS.maxCoord);
  if (c !== v) t.add('item-clamped');
  return c;
}

/** Không ghi màu thì dùng màu mặc định, im lặng. Có ghi mà sai mã thì dùng màu mặc định và báo. */
function colorOr(raw: unknown, fallback: string, t: Tally): string {
  const dflt = normHex(fallback) ?? fallback;
  if (raw === undefined || raw === null) return dflt;
  const c = normHex(raw);
  if (c) return c;
  t.add('color-reset');
  return dflt;
}

/* ---------- Từng món ---------- */

function sanitizeFloor(raw: unknown, reg: Registry, t: Tally): FloorItem | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id || raw.id.length > FIELD_LIMITS.maxId) {
    t.add('items-dropped');
    return null;
  }
  const fileId = raw.id;
  const def = reg.resolve(fileId);
  if (def && def.place !== 'floor') {
    t.add('items-dropped');
    return null;
  }
  const name = def ? def.name : cleanText(raw.name, FIELD_LIMITS.maxItemName);
  let w = num(raw.w) ?? (def ? def.w : null);
  let d = num(raw.d) ?? (def ? def.d : null);
  const x = num(raw.x);
  const y = num(raw.y);
  if (!name || w === null || d === null || x === null || y === null) {
    t.add('items-dropped');
    return null;
  }
  w = clampSize(w, t);
  d = clampSize(d, t);
  if (def && def.id !== fileId) t.add('replaced');
  if (!def) t.add('custom-items');
  const item: FloorItem = {
    uid: 0,
    id: def ? def.id : fileId,
    name,
    w,
    d,
    x: clampCoord(x, t),
    y: clampCoord(y, t),
    rot: normDeg(r1(num(raw.rot) ?? 0)),
    color: colorOr(raw.color, def?.color ?? FALLBACK_ITEM_COLOR, t),
    z: def ? (def.layer === 'under' ? 0 : 1) : raw.z === 0 ? 0 : 1,
  };
  if (!def) {
    const h = num(raw.h);
    if (h !== null) item.h = clamp(h, 1, LIMITS.itemSize.max);
  }
  if (raw.locked === true) item.locked = true;
  return item;
}

function sanitizeWall(raw: unknown, reg: Registry, t: Tally): WallItem | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id || raw.id.length > FIELD_LIMITS.maxId) {
    t.add('items-dropped');
    return null;
  }
  const fileId = raw.id;
  const def = reg.resolve(fileId);
  if (def && def.place !== 'wall') {
    t.add('items-dropped');
    return null;
  }
  const name = def ? def.name : cleanText(raw.name, FIELD_LIMITS.maxItemName);
  let w = num(raw.w) ?? (def ? def.w : null);
  let h = num(raw.h) ?? (def ? def.h : null);
  const x = num(raw.x);
  const y = num(raw.y) ?? (def ? (def.y ?? 0) : null);
  if (!name || w === null || h === null || x === null || y === null) {
    t.add('items-dropped');
    return null;
  }
  w = clampSize(w, t);
  h = clampSize(h, t);
  const yy = clamp(y, LIMITS.itemY.min, LIMITS.itemY.max);
  if (yy !== y) t.add('item-clamped');
  if (def && def.id !== fileId) t.add('replaced');
  if (!def) t.add('custom-items');
  const item: WallItem = {
    uid: 0,
    id: def ? def.id : fileId,
    name,
    w,
    h,
    x: clampCoord(x, t),
    y: yy,
    color: colorOr(raw.color, def?.color ?? FALLBACK_ITEM_COLOR, t),
  };
  if (!def) {
    const d = num(raw.d);
    if (d !== null) item.d = clamp(d, 1, LIMITS.itemSize.max);
  }
  if (raw.locked === true) item.locked = true;
  return item;
}

/* ---------- Cửa đi, cửa sổ ---------- */

/** Cạnh lan can từ file hoặc bộ nhớ: danh sách cạnh hợp lệ (bỏ cạnh lạ và trùng, theo thứ tự trên, phải, dưới, trái). Không phải danh sách thì lấy mặc định của loại phòng. */
function railsOr(raw: unknown, fallback: readonly WallKey[] | undefined): WallKey[] | undefined {
  if (!Array.isArray(raw)) return fallback ? [...fallback] : undefined;
  return WALL_KEYS.filter((w) => raw.includes(w));
}

const isWall = (v: unknown): v is WallKey => typeof v === 'string' && (WALL_KEYS as readonly string[]).includes(v);

interface RoomBox {
  W: number;
  H: number;
  ceil: number;
}

/** Một cửa đi hoặc cửa sổ trong file. Sai tường hoặc thiếu số thì bỏ; số ngoài khoảng thì kéo vào gọn trong tường. */
function cleanOpening(raw: unknown, room: RoomBox, t: Tally): (OpeningDef & { uid: number }) | null {
  const pos = isObj(raw) ? num(raw.pos) : null;
  const w = isObj(raw) ? num(raw.w) : null;
  if (!isObj(raw) || !isWall(raw.wall) || pos === null || w === null) {
    t.add('openings-fixed');
    return null;
  }
  const asked = { uid: 0, wall: raw.wall, pos: Math.round(pos), w: Math.round(w) };
  const fitted = fitOpening(asked, room.W, room.H);
  if (fitted.pos !== asked.pos || fitted.w !== asked.w) t.add('openings-fixed');
  return fitted;
}

/** Cửa đi: thêm hướng mở cánh. Chỉ ghi giá trị khác mặc định; giá trị lạ thì coi như mặc định. */
function cleanDoor(raw: unknown, room: RoomBox, t: Tally): DoorItem | null {
  const door: DoorItem | null = cleanOpening(raw, room, t);
  if (!door) return null;
  const r = raw as Record<string, unknown>;
  if (r.hinge === 'end') door.hinge = 'end';
  if (r.swing === 'out') door.swing = 'out';
  return door;
}

function cleanWindow(raw: unknown, room: RoomBox, t: Tally): WindowItem | null {
  const base = cleanOpening(raw, room, t);
  if (!base) return null;
  const win: WindowItem = base;
  const r = raw as Record<string, unknown>;
  const sill = num(r.sill);
  if (sill !== null) win.sill = clamp(Math.round(sill), 0, Math.max(0, room.ceil - 10));
  const h = num(r.h);
  if (h !== null) win.h = clamp(Math.round(h), 10, Math.max(10, room.ceil - (win.sill ?? 0)));
  return win;
}

/**
 * Danh sách cửa của một phòng. File không ghi (file cũ, hoặc ghi không phải danh sách) thì dùng cửa mặc định của phòng.
 * File có ghi thì tin file, kể cả danh sách rỗng. Quá nhiều thì bỏ phần dư.
 */
function openingList<D extends OpeningDef, T>(raw: unknown, defaults: readonly D[], make: (d: D) => T, clean: (r: unknown) => T | null, t: Tally): T[] {
  if (!Array.isArray(raw)) {
    if (raw !== undefined) t.add('openings-fixed');
    return defaults.map(make);
  }
  if (raw.length > LIMITS.maxOpeningsPerKind) t.add('openings-fixed', raw.length - LIMITS.maxOpeningsPerKind);
  const out: T[] = [];
  for (const r of raw.slice(0, LIMITS.maxOpeningsPerKind)) {
    const o = clean(r);
    if (o) out.push(o);
  }
  return out;
}

/* ---------- Cả phòng ---------- */

export type RoomResult =
  | { ok: true; layout: Layout }
  | { ok: false; code: 'invalid'; detail: string }
  | { ok: false; code: 'too-many'; detail: string };

/** Làm sạch một phòng. uid của mọi món là 0, gán mã thật bằng assignUids khi đưa vào ứng dụng. */
export function sanitizeRoom(raw: unknown, def: RoomDef, reg: Registry, t: Tally): RoomResult {
  const id = def.id;
  if (!isObj(raw)) return { ok: false, code: 'invalid', detail: `phòng "${id}" không phải một đối tượng` };
  const dim = (key: RoomDimKey, fallback: number): number => {
    const v = num(raw[key]);
    if (v === null) {
      t.add('room-clamped');
      return fallback;
    }
    const { min, max } = ROOM_DIM_LIMITS[key];
    const rounded = Math.round(v);
    const c = clamp(rounded, min, max);
    if (c !== rounded) t.add('room-clamped');
    return c;
  };
  const itemsRaw = raw.items ?? [];
  if (!Array.isArray(itemsRaw)) return { ok: false, code: 'invalid', detail: `phòng "${id}": "items" không phải danh sách` };
  const wallsRaw = raw.walls ?? {};
  if (!isObj(wallsRaw)) return { ok: false, code: 'invalid', detail: `phòng "${id}": "walls" không phải đối tượng` };

  let total = itemsRaw.length;
  for (const wk of WALL_KEYS) {
    const list = wallsRaw[wk] ?? [];
    if (!Array.isArray(list)) return { ok: false, code: 'invalid', detail: `phòng "${id}": tường ${wk} không phải danh sách` };
    total += list.length;
  }
  if (total > LIMITS.maxItemsPerRoom) return { ok: false, code: 'too-many', detail: `phòng "${def.name}" có ${total} món` };

  const walls = { T: [], R: [], B: [], L: [] } as Record<WallKey, WallItem[]>;
  const box: RoomBox = { W: dim('W', def.W), H: dim('H', def.H), ceil: dim('ceil', def.ceil) };
  const layout: Layout = {
    ...box,
    floor: colorOr(raw.floor, FLOOR_COLORS[def.floor]?.hex ?? FLOOR_COLORS[0]!.hex, t),
    wall: colorOr(raw.wall, WALL_COLORS[0]!.hex, t),
    items: [],
    walls,
    doors: openingList(raw.doors, def.doors, (d) => fitOpening({ ...d, uid: 0 }, box.W, box.H), (r) => cleanDoor(r, box, t), t),
    windows: openingList(raw.windows, def.windows, (d) => fitOpening({ ...d, uid: 0 }, box.W, box.H), (r) => cleanWindow(r, box, t), t),
  };
  const rails = railsOr(raw.rails, def.rails);
  if (rails) layout.rails = rails;
  for (const r of itemsRaw) {
    const it = sanitizeFloor(r, reg, t);
    if (it) layout.items.push(it);
  }
  for (const wk of WALL_KEYS) {
    for (const r of (wallsRaw[wk] ?? []) as unknown[]) {
      const it = sanitizeWall(r, reg, t);
      if (it) walls[wk].push(it);
    }
  }
  return { ok: true, layout };
}

/**
 * Làm sạch bố trí đọc từ bộ nhớ trình duyệt. Cấu trúc hỏng thì trả về null để app dùng bố trí mẫu
 * (khác với file nhập, nơi thiếu trường được bỏ qua, ở đây thiếu trường nghĩa là dữ liệu đã hỏng).
 */
export function sanitizeSaved(raw: unknown, def: RoomDef, reg: Registry): Layout | null {
  if (!isUsableLayout(raw)) return null;
  const res = sanitizeRoom(raw, def, reg, new Tally());
  return res.ok ? res.layout : null;
}

/**
 * Vị trí các phòng trong mô hình căn hộ, từ file hoặc dữ liệu tự lưu. Chỉ giữ phòng có mã hợp lệ (và nằm trong `ids` nếu có)
 * cùng hai số hữu hạn (và thứ tự lớp z nếu có); làm tròn cm và kẹp trong khoảng hợp lý để bản vẽ không vỡ vì số quá lớn.
 * Không phải đối tượng thì coi như chưa có vị trí nào.
 */
export function sanitizeApt(raw: unknown, ids?: readonly RoomId[]): AptPlan {
  const out: AptPlan = {};
  if (!isObj(raw)) return out;
  for (const id of ids ?? Object.keys(raw)) {
    if (!isRoomIdString(id)) continue;
    const v = raw[id];
    if (!isObj(v)) continue;
    const x = num(v.x);
    const y = num(v.y);
    if (x === null || y === null) continue;
    const z = num(v.z);
    out[id] = {
      x: Math.round(clamp(x, -FIELD_LIMITS.maxCoord, FIELD_LIMITS.maxCoord)),
      y: Math.round(clamp(y, -FIELD_LIMITS.maxCoord, FIELD_LIMITS.maxCoord)),
      // thứ tự lớp: số nguyên không âm, bỏ nếu là 0 hoặc không hợp lệ
      ...(z !== null && Math.round(z) > 0 ? { z: Math.min(10_000, Math.round(z)) } : {}),
    };
  }
  return out;
}

/**
 * Danh sách phòng của căn hộ, từ file hoặc dữ liệu tự lưu: mã hợp lệ và không trùng, loại có trong trang này, tên là văn bản thuần
 * (thiếu thì lấy tên loại), tối đa LIMITS.maxRooms phòng. Không có mục nào dùng được thì null (để dùng căn hộ mặc định).
 */
export function sanitizeRoomList(raw: unknown): RoomEntry[] | null {
  if (!Array.isArray(raw)) return null;
  const out: RoomEntry[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (!isObj(r) || !isRoomIdString(r.id) || seen.has(r.id) || !isRoomTypeId(r.type)) continue;
    seen.add(r.id);
    out.push({ id: r.id, type: r.type, name: cleanText(r.name, MAX_ROOM_NAME) || ROOMS[r.type].name });
    if (out.length >= LIMITS.maxRooms) break;
  }
  return out.length ? out : null;
}
