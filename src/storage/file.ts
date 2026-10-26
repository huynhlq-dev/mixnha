import { plain } from '../core/format';
import { assignUids, countItems, type NextUid } from '../core/layout';
import { LIMITS } from '../core/limits';
import type { Registry } from '../core/registry';
import type { AptPlan, DoorItem, FloorItem, Layout, Layouts, WallItem, WindowItem } from '../core/types';
import { isRoomTypeId, roomDef } from '../core/rooms';
import { DEFAULT_ROOMS, ROOM_TYPE_IDS, ROOMS, type RoomEntry, type RoomId } from '../data/rooms';
import type { WallKey } from '../data/schema';
import { WALL_KEYS } from '../data/walls';
import { CURRENT_VER, migrate, type RawDoc } from './migrations';
import { cleanText, FIELD_LIMITS, sanitizeApt, sanitizeRoom, sanitizeRoomList, Tally, type ImportWarning } from './sanitize';

export { cleanText } from './sanitize';
export type { ImportWarning, WarningCode } from './sanitize';

/** Nhận dạng đúng loại file. Giữ nguyên dù đổi tên sản phẩm, vì file đã xuất ra ngoài mang giá trị này. */
export const FILE_APP = 'xepnha2d';

export const FILE_LIMITS = {
  maxBytes: 2 * 1024 * 1024,
  maxItemsPerRoom: LIMITS.maxItemsPerRoom,
  ...FIELD_LIMITS,
} as const;

export type ExportScope = 'all' | 'room';

/* ---------- Định dạng file ---------- */

type NoUid<T> = Omit<T, 'uid'>;

export interface FileRoom {
  W: number;
  H: number;
  ceil: number;
  floor: string;
  wall: string;
  items: NoUid<FloorItem>[];
  walls: Record<WallKey, NoUid<WallItem>[]>;
  /** pos là khoảng cách từ góc tới mép cửa (cm); mặt bằng: tường trên, dưới tính từ góc trái, tường trái, phải tính từ góc trên. */
  doors: NoUid<DoorItem>[];
  windows: NoUid<WindowItem>[];
  /** Các cạnh làm lan can thay cho tường (ban công). Không ghi thì theo loại phòng. */
  rails?: WallKey[];
}

export interface DesignFile {
  app: typeof FILE_APP;
  ver: number;
  name?: string;
  note?: string;
  exportedAt?: string;
  units: 'cm';
  scope: ExportScope;
  rooms: Partial<Record<RoomId, FileRoom>>;
  /** Vị trí các phòng trong mô hình căn hộ (góc trên trái, cm). Chỉ ghi khi xuất cả căn và đã chỉnh bố cục. */
  apartment?: AptPlan;
  /** Các phòng trong file theo thứ tự tab: mã, loại và tên. File cũ (trước khi phòng thêm, xóa được) không có: mã phòng là mã loại. */
  roomList?: RoomEntry[];
}

/* ---------- Xuất ---------- */

export interface ExportOptions {
  scope: ExportScope;
  /** Phòng đang mở, dùng khi scope là "room". */
  room: RoomId;
  name?: string;
  note?: string;
  now: Date;
  /** Vị trí các phòng trong mô hình căn hộ; có thì ghi vào file khi xuất cả căn. */
  apt?: AptPlan;
  /** Các phòng của căn hộ theo thứ tự tab. Không ghi thì là bốn phòng mặc định. */
  rooms?: readonly RoomEntry[];
}

const r1 = (v: number): number => Math.round(v * 10) / 10;

function stripUid<T extends { uid: number }>(it: T): NoUid<T> {
  const { uid: _uid, ...rest } = it;
  return rest;
}

function roundItem<T extends { x: number; y: number; w: number }>(it: T): T {
  const out = { ...it, x: r1(it.x), y: r1(it.y), w: r1(it.w) };
  for (const k of ['d', 'h', 'rot'] as const) {
    const v = (out as Record<string, unknown>)[k];
    if (typeof v === 'number') (out as Record<string, unknown>)[k] = r1(v);
  }
  return out;
}

export function toFileRoom(l: Layout): FileRoom {
  const walls = { T: [], R: [], B: [], L: [] } as FileRoom['walls'];
  for (const w of WALL_KEYS) walls[w] = l.walls[w].map((i) => roundItem(stripUid(i)));
  return {
    W: l.W,
    H: l.H,
    ceil: l.ceil,
    floor: l.floor,
    wall: l.wall,
    items: l.items.map((i) => roundItem(stripUid(i))),
    walls,
    doors: l.doors.map(stripUid),
    windows: l.windows.map(stripUid),
    ...(l.rails ? { rails: [...l.rails] } : {}),
  };
}

/** Ngày giờ theo múi giờ máy, dạng 2026-10-20T10:05:00+07:00. */
export function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sign}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}

export function buildFile(layouts: Layouts, o: ExportOptions): DesignFile {
  const rooms: DesignFile['rooms'] = {};
  const all = o.rooms ?? DEFAULT_ROOMS;
  const entries = o.scope === 'all' ? all : all.filter((r) => r.id === o.room);
  for (const e of entries) rooms[e.id] = toFileRoom(layouts[e.id]!);
  const name = cleanText(o.name, FILE_LIMITS.maxName);
  const note = cleanText(o.note, FILE_LIMITS.maxNote);
  return {
    app: FILE_APP,
    ver: CURRENT_VER,
    ...(name ? { name } : {}),
    ...(note ? { note } : {}),
    exportedAt: isoLocal(o.now),
    units: 'cm',
    scope: o.scope,
    rooms,
    roomList: entries.map((e) => ({ id: e.id, type: e.type, name: e.name })),
    ...(o.scope === 'all' && o.apt && Object.keys(o.apt).length ? { apartment: o.apt } : {}),
  };
}

export function serializeFile(f: DesignFile): string {
  return JSON.stringify(f, null, 2);
}

export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Tên file tự tạo từ tên bản thiết kế và ngày: can-ho-cua-toi-20261020.json */
export function makeFilename(name: string | undefined, now: Date): string {
  const slug = plain(name ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  const p = (n: number) => String(n).padStart(2, '0');
  return `${slug || 'ban-thiet-ke'}-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}.json`;
}

/** Số phòng và số món sẽ nằm trong file, để hiện trong hộp thoại xuất. */
export function summarizeExport(layouts: Layouts, scope: ExportScope, room: RoomId, rooms: readonly RoomEntry[] = DEFAULT_ROOMS): { rooms: number; items: number } {
  const ids: readonly RoomId[] = scope === 'all' ? rooms.map((r) => r.id) : [room];
  let items = 0;
  for (const id of ids) items += countItems(layouts[id]!);
  return { rooms: ids.length, items };
}

/* ---------- Nhập ---------- */

export interface ImportedRoom {
  id: RoomId;
  /** Mã, loại và tên của phòng như trong file. */
  entry: RoomEntry;
  /** Bố trí đã kiểm tra. uid của mọi món là 0, gán mã thật bằng layoutFromImported khi áp dụng. */
  layout: Layout;
  itemCount: number;
}

export interface ParsedFile {
  name: string;
  note: string;
  exportedAt: string | null;
  scope: ExportScope;
  rooms: ImportedRoom[];
  warnings: ImportWarning[];
  /** Vị trí các phòng trong mô hình căn hộ ghi trong file (đã làm sạch); rỗng nếu file không có. */
  apt: AptPlan;
}

export type ImportErrorCode = 'too-large' | 'not-json' | 'invalid' | 'newer' | 'too-many';

export interface ImportError {
  code: ImportErrorCode;
  title: string;
  message: string;
  detail?: string;
}

export type ParseResult = { ok: true; file: ParsedFile } | { ok: false; error: ImportError };

const GENERIC_BAD = 'File không phải bản thiết kế của trang này, hoặc đã bị sửa làm hỏng. Hãy xin người gửi xuất lại, hoặc chọn file khác. Bản vẽ của bạn chưa bị thay đổi.';

function failure(code: ImportErrorCode, title: string, message: string, detail?: string): ParseResult {
  return { ok: false, error: { code, title, message, ...(detail ? { detail } : {}) } };
}

const bad = (detail: string): ParseResult => failure('invalid', 'Không đọc được file này', GENERIC_BAD, detail);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** File lớn hơn mức cho phép thì báo lỗi, để giao diện từ chối ngay cả khi chưa đọc nội dung. */
export function checkFileSize(bytes: number): ParseResult | null {
  if (bytes <= FILE_LIMITS.maxBytes) return null;
  return failure('too-large', 'File quá lớn', `File lớn hơn ${FILE_LIMITS.maxBytes / 1024 / 1024} MB nên trang không nhập. Một bản thiết kế bình thường chỉ vài chục KB.`);
}

/** Kiểm tra và đọc nội dung file. Hàm dùng chung cho chọn file, kéo thả và dán nội dung. */
export function parseDesignFile(text: string, reg: Registry): ParseResult {
  const big = checkFileSize(byteLength(text));
  if (big) return big;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return failure('not-json', 'Không đọc được file này', GENERIC_BAD, 'không phải định dạng JSON');
  }
  if (!isObj(json)) return bad('nội dung không phải một đối tượng JSON');
  if (json.app !== FILE_APP) return bad('thiếu hoặc sai trường "app"');
  if (typeof json.ver !== 'number' || !Number.isInteger(json.ver) || json.ver < 1) return bad('thiếu hoặc sai trường "ver"');
  if (!isObj(json.rooms)) return bad('thiếu trường "rooms"');
  if (json.units !== undefined && json.units !== 'cm') return bad('đơn vị không phải "cm"');
  if (json.ver > CURRENT_VER) {
    return failure('newer', 'File tạo từ bản mới hơn', 'File này được tạo bằng một phiên bản mới hơn của trang. Hãy tải lại trang để cập nhật rồi thử lại.', `phiên bản file ${json.ver}, trang hiểu tới ${CURRENT_VER}`);
  }

  const { doc } = migrate(json as RawDoc);
  const roomsRaw = doc.rooms as Record<string, unknown>;
  const tally = new Tally();
  const rooms: ImportedRoom[] = [];
  const listed = sanitizeRoomList(doc.roomList);
  const byId = new Map((listed ?? []).map((e) => [e.id, e]));
  for (const [key, value] of Object.entries(roomsRaw)) {
    // file cũ không có roomList: khóa là mã loại phòng, cũng là mã phòng
    const entry = byId.get(key) ?? (isRoomTypeId(key) ? { id: key, type: key, name: ROOMS[key].name } : undefined);
    if (!entry) {
      tally.add('unknown-room');
      continue;
    }
    const res = sanitizeRoom(value, roomDef(entry), reg, tally);
    if (!res.ok) {
      if (res.code === 'too-many') {
        return failure('too-many', 'File có quá nhiều món', `Một phòng trong file có nhiều hơn ${LIMITS.maxItemsPerRoom} món. Trang không nhập file này để tránh bị chậm.`, res.detail);
      }
      return bad(res.detail);
    }
    rooms.push({ id: entry.id, entry, layout: res.layout, itemCount: countItems(res.layout) });
  }
  if (!rooms.length) return bad('không có phòng nào dùng được trong "rooms"');
  // thứ tự như trong roomList; file cũ thì theo thứ tự loại phòng
  const order = (id: RoomId): number => {
    const i = listed ? listed.findIndex((e) => e.id === id) : ROOM_TYPE_IDS.indexOf(id as never);
    return i < 0 ? ROOM_TYPE_IDS.length + (listed?.length ?? 0) : i;
  };
  rooms.sort((a, b) => order(a.id) - order(b.id));

  return {
    ok: true,
    file: {
      name: cleanText(doc.name, FILE_LIMITS.maxName),
      note: cleanText(doc.note, FILE_LIMITS.maxNote),
      exportedAt: typeof doc.exportedAt === 'string' ? cleanText(doc.exportedAt, 40) || null : null,
      scope: doc.scope === 'room' ? 'room' : 'all',
      rooms,
      warnings: tally.list(),
      apt: sanitizeApt(
        doc.apartment,
        rooms.map((r) => r.id),
      ),
    },
  };
}

/** Gán mã uid thật cho mọi món của một phòng đã kiểm tra, rồi trả về bố trí dùng được. Không đổi bản đã đọc. */
export function layoutFromImported(room: ImportedRoom, nextUid: NextUid): Layout {
  const l = JSON.parse(JSON.stringify(room.layout)) as Layout;
  assignUids(l, nextUid);
  return l;
}
