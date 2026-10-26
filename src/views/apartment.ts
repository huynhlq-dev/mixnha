import { analysePlan, overlappingOpenings } from '../core/analyse';
import { interiorSpace } from '../core/interior';
import { escapeHtml, fm } from '../core/format';
import { boxOf, doorGeom, windowGeom } from '../core/geometry';
import { coversOf, MIN_VISIBLE, overlaps, stackOrder, topmostAt, uncoveredArea, visibleEnough } from '../core/overlap';
import type { Registry } from '../core/registry';
import type { RoomGeo } from '../core/room';
import { ROOM_DIM_LIMITS } from '../core/limits';
import type { AptPlan, Layout, OpeningSel, Selection } from '../core/types';
import { ROOM_IDS, type RoomId, type RoomTypeId } from '../data/rooms';
import type { Frame } from './frame';
import { renderPlan } from './plan';
import { edgeTag, n2 } from './svg';
import type { Bounds } from './viewport';
import { t, tn } from '../i18n';

/** Một phòng trong mô hình căn hộ: bản vẽ và hình học hiện tại của phòng. */
export interface AptRoom {
  id: RoomId;
  name: string;
  /** Loại phòng, để biết xếp vào chỗ nào khi tự xếp lưới. */
  type: RoomTypeId;
  layout: Layout;
  geo: RoomGeo;
}

export interface AptRect {
  id: RoomId;
  /** Góc trên trái của phòng trong hệ tọa độ căn hộ (cm). */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Thứ tự các LOẠI phòng khi tự xếp lưới, từ trái sang phải rồi xuống hàng; cùng loại thì theo thứ tự trong danh sách phòng, loại không có ở đây xếp nối vào cuối. */
export const APT_ORDER: readonly string[] = ['khach', 'bep', 'ngu', 'lamviec', 'wc', 'trong', 'banchong'];
/** Số phòng mỗi hàng. */
export const APT_COLUMNS = 2;
/** Khoảng cách giữa các phòng (cm), đóng vai hành lang. */
export const APT_GAP = 90;
/** Lề quanh cả căn hộ (cm). */
export const APT_PAD = 70;
/** Khoảng cách tối thiểu giữa hai phòng khi kéo (cm): hai lớp tường dày 10 cm của hai phòng chạm nhau, như một bức tường chung. */
export const APT_MIN_GAP = 20;
/** Bước bám lưới khi kéo phòng và đổi kích thước phòng (cm). */
export const APT_GRID = 10;
/** Cách mép phòng khác tối đa bấy nhiêu cm thì mép phòng đang kéo được hút vào (khi bật bám lưới). */
export const APT_MAGNET = 15;

const INK = '#15211E';

/** Thứ tự tự xếp lưới của các phòng. types[id] là loại phòng; không có thì lấy chính mã phòng làm loại. */
export function aptOrder(ids: readonly RoomId[] = ROOM_IDS, types: Readonly<Record<RoomId, string>> = {}): RoomId[] {
  const rank = (id: RoomId): number => {
    const i = APT_ORDER.indexOf(types[id] ?? id);
    return i < 0 ? APT_ORDER.length : i;
  };
  return ids
    .map((id, i) => ({ id, i }))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.i - b.i)
    .map((x) => x.id);
}

/**
 * Xếp các phòng. Phòng chưa có vị trí trong plan thì nằm ở ô của nó trong lưới APT_COLUMNS cột (cột rộng bằng phòng rộng nhất
 * cột đó, hàng cao bằng phòng cao nhất hàng đó, phòng ở góc trên trái của ô); phòng đã có vị trí thì lấy đúng vị trí đó.
 * Đổi kích thước một phòng thì các phòng tự xếp theo lưới xếp lại theo. footprint là hình bao mọi phòng, bounds là khung nhìn toàn căn kèm lề.
 */
export function apartmentRects(
  sizes: Readonly<Record<RoomId, { W: number; H: number }>>,
  ids: readonly RoomId[] = ROOM_IDS,
  plan: AptPlan = {},
  types: Readonly<Record<RoomId, string>> = {},
): { rects: Record<RoomId, AptRect>; footprint: Bounds; bounds: Bounds; stack: RoomId[] } {
  const order = aptOrder(ids, types);
  const cols = Math.min(APT_COLUMNS, Math.max(1, order.length));
  const rows = Math.ceil(order.length / cols);
  const colW = Array.from({ length: cols }, () => 0);
  const rowH = Array.from({ length: rows }, () => 0);
  order.forEach((id, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    colW[c] = Math.max(colW[c]!, sizes[id].W);
    rowH[r] = Math.max(rowH[r]!, sizes[id].H);
  });
  const colX = colW.map((_, c) => colW.slice(0, c).reduce((a, b) => a + b, 0) + c * APT_GAP);
  const rowY = rowH.map((_, r) => rowH.slice(0, r).reduce((a, b) => a + b, 0) + r * APT_GAP);
  const rects = {} as Record<RoomId, AptRect>;
  order.forEach((id, i) => {
    const at = plan[id] ?? { x: colX[i % cols]!, y: rowY[Math.floor(i / cols)]! };
    rects[id] = { id, x: at.x, y: at.y, w: sizes[id].W, h: sizes[id].H };
  });
  const list = Object.values(rects);
  const x0 = Math.min(...list.map((r) => r.x));
  const y0 = Math.min(...list.map((r) => r.y));
  const footprint: Bounds = { x: x0, y: y0, w: Math.max(...list.map((r) => r.x + r.w)) - x0, h: Math.max(...list.map((r) => r.y + r.h)) - y0 };
  const stack = stackOrder(ids, (id) => plan[id]?.z ?? 0);
  return { rects, footprint, bounds: { x: footprint.x - APT_PAD, y: footprint.y - APT_PAD, w: footprint.w + 2 * APT_PAD, h: footprint.h + 2 * APT_PAD }, stack };
}

/** Vị trí hiện tại của mọi phòng (kể cả phòng đang tự xếp), để "chốt" lại trước khi người dùng kéo: từ đó các phòng không tự nhảy khi đổi cỡ. */
export function freezePlan(rects: Readonly<Record<RoomId, AptRect>>, prev: AptPlan = {}): AptPlan {
  const plan: AptPlan = {};
  for (const r of Object.values(rects)) {
    const z = prev[r.id]?.z;
    plan[r.id] = { x: r.x, y: r.y, ...(z ? { z } : {}) };
  }
  return plan;
}

const round = (v: number): number => Math.round(v);

/** Hai phòng có chồng hoặc nằm gần nhau hơn APT_MIN_GAP không. */
export function roomsClash(a: Pick<AptRect, 'x' | 'y' | 'w' | 'h'>, b: Pick<AptRect, 'x' | 'y' | 'w' | 'h'>, gap: number = APT_MIN_GAP): boolean {
  const apart = a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x || a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y;
  return !apart;
}

const clashesAny = (r: AptRect, others: readonly AptRect[]): boolean => others.some((o) => roomsClash(r, o));

/**
 * Phòng chứa điểm p (theo tọa độ căn hộ, cm). pad mở rộng mỗi phía (ví dụ độ dày tường). Có `stack` (thứ tự lớp từ dưới lên) thì lấy phòng
 * nằm trên cùng; không thì lấy phòng có tâm gần p hơn. Điểm nằm ngoài mọi phòng (hành lang) thì null.
 */
export function roomAtPoint(rects: Readonly<Record<RoomId, AptRect>>, p: { x: number; y: number }, pad = 0, stack?: readonly RoomId[]): RoomId | null {
  if (stack) return topmostAt(rects, stack, p, pad);
  let best: RoomId | null = null;
  let bestD = Infinity;
  for (const r of Object.values(rects)) {
    if (p.x < r.x - pad || p.x > r.x + r.w + pad || p.y < r.y - pad || p.y > r.y + r.h + pad) continue;
    const d = Math.hypot(p.x - (r.x + r.w / 2), p.y - (r.y + r.h / 2));
    if (d < bestD) {
      bestD = d;
      best = r.id;
    }
  }
  return best;
}

/** Số trong `cands` gần v nhất nếu cách không quá `within`, không thì null. */
function nearest(v: number, cands: readonly number[], within: number): number | null {
  let best: number | null = null;
  for (const c of cands) if (Math.abs(c - v) <= within && (best === null || Math.abs(c - v) < Math.abs(best - v))) best = c;
  return best;
}

/**
 * Vị trí phòng sau khi bám lưới và hút vào mép phòng khác (chưa tính chuyện chạm nhau): bật snap thì mép trái, trên bám lưới APT_GRID
 * và được hút vào mép phòng khác (cùng mép, hoặc cách APT_MIN_GAP) khi cách không quá APT_MAGNET; tắt thì chỉ làm tròn cm.
 */
export function snapRoom(rects: Readonly<Record<RoomId, AptRect>>, id: RoomId, want: { x: number; y: number }, snap: boolean): { x: number; y: number } {
  const cur = rects[id];
  if (!snap) return { x: round(want.x), y: round(want.y) };
  const others = Object.values(rects).filter((r) => r.id !== id);
  const xs = others.flatMap((o) => [o.x, o.x + o.w - cur.w, o.x + o.w + APT_MIN_GAP, o.x - cur.w - APT_MIN_GAP]);
  const ys = others.flatMap((o) => [o.y, o.y + o.h - cur.h, o.y + o.h + APT_MIN_GAP, o.y - cur.h - APT_MIN_GAP]);
  return { x: nearest(want.x, xs, APT_MAGNET) ?? Math.round(want.x / APT_GRID) * APT_GRID, y: nearest(want.y, ys, APT_MAGNET) ?? Math.round(want.y / APT_GRID) * APT_GRID };
}

/**
 * Chỗ đặt một phòng mới rộng w, cao h. Có want (góc trên trái mong muốn, ví dụ nơi thả chuột) và chỗ đó không chạm phòng nào thì lấy
 * đúng chỗ đó (bám lưới nếu snap). Không thì thử đặt sát bên phải, dưới, trái, trên từng phòng đang có (cách APT_GAP) và lấy chỗ
 * gần want nhất (không có want thì gần giữa căn nhất). Chỗ nào cũng chật thì đặt dưới cùng, chỗ này luôn trống.
 */
export function roomSpot(rects: Readonly<Record<RoomId, AptRect>>, w: number, h: number, want: { x: number; y: number } | null, snap: boolean): { x: number; y: number } {
  const others = Object.values(rects);
  const fits = (x: number, y: number): boolean => !clashesAny({ id: '', x, y, w, h }, others);
  if (want) {
    const x = snap ? Math.round(want.x / APT_GRID) * APT_GRID : round(want.x);
    const y = snap ? Math.round(want.y / APT_GRID) * APT_GRID : round(want.y);
    if (fits(x, y)) return { x, y };
  }
  const x0 = Math.min(...others.map((r) => r.x), 0);
  const y0 = Math.min(...others.map((r) => r.y), 0);
  const x1 = Math.max(...others.map((r) => r.x + r.w), w);
  const y1 = Math.max(...others.map((r) => r.y + r.h), h);
  const target = want ?? { x: (x0 + x1 - w) / 2, y: (y0 + y1 - h) / 2 };
  const cands: { x: number; y: number }[] = [];
  for (const o of others) cands.push({ x: o.x + o.w + APT_GAP, y: o.y }, { x: o.x, y: o.y + o.h + APT_GAP }, { x: o.x - w - APT_GAP, y: o.y }, { x: o.x, y: o.y - h - APT_GAP });
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const c of cands) {
    if (!fits(c.x, c.y)) continue;
    const d = Math.hypot(c.x - target.x, c.y - target.y);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best ?? { x: x0, y: y1 + APT_GAP };
}

/** Cỡ phòng sau khi bám lưới, hút vào mép phòng khác và kẹp trong khoảng cho phép (150 đến 1500 cm); góc trên trái đứng yên. Chưa tính chuyện chạm nhau. */
export function snapSize(rects: Readonly<Record<RoomId, AptRect>>, id: RoomId, want: { w: number; h: number }, snap: boolean): { w: number; h: number } {
  const cur = rects[id];
  const others = Object.values(rects).filter((r) => r.id !== id);
  const { W: lw, H: lh } = ROOM_DIM_LIMITS;
  const lim = (v: number, l: { min: number; max: number }): number => Math.min(l.max, Math.max(l.min, round(v)));
  let w = want.w;
  let h = want.h;
  if (snap) {
    const rights = others.flatMap((o) => [o.x + o.w - cur.x, o.x - APT_MIN_GAP - cur.x]);
    const bottoms = others.flatMap((o) => [o.y + o.h - cur.y, o.y - APT_MIN_GAP - cur.y]);
    w = nearest(w, rights, APT_MAGNET) ?? Math.round((cur.x + w) / APT_GRID) * APT_GRID - cur.x;
    h = nearest(h, bottoms, APT_MAGNET) ?? Math.round((cur.y + h) / APT_GRID) * APT_GRID - cur.y;
  }
  return { w: lim(w, lw), h: lim(h, lh) };
}

/** Danh sách lớp sau khi đưa phòng `id` lên trên cùng. */
const onTop = (stack: readonly RoomId[], id: RoomId): RoomId[] => [...stack.filter((s) => s !== id), id];

/** Đặt phòng `id` vào hộp `box` (và đưa lên trên) thì mọi phòng khác có còn đủ phần thấy được không. */
function canPlace(rects: Readonly<Record<RoomId, AptRect>>, stack: readonly RoomId[], id: RoomId, box: { x: number; y: number; w: number; h: number }): boolean {
  return visibleEnough({ ...rects, [id]: { id, ...box } } as Record<RoomId, AptRect>, onTop(stack, id));
}

/**
 * Kéo phòng `id` tới (x, y) mong muốn (bám lưới, hút vào mép phòng khác). Phòng được đè lên phòng khác: phòng đang kéo nằm trên và
 * "khuyết" phần phòng bị đè, miễn mỗi phòng còn thấy ít nhất MIN_VISIBLE. Không được thì thử chỉ đổi x, chỉ đổi y từ chỗ `last`
 * (vị trí hợp lệ ngay trước đó), cuối cùng đứng yên ở `last`: phòng đang kéo dừng ở mép, không đè thêm.
 */
export function moveOver(rects: Readonly<Record<RoomId, AptRect>>, stack: readonly RoomId[], id: RoomId, last: { x: number; y: number }, want: { x: number; y: number }, snap: boolean): { x: number; y: number } {
  const cur = rects[id];
  const p = snapRoom(rects, id, want, snap);
  for (const c of [p, { x: p.x, y: last.y }, { x: last.x, y: p.y }]) {
    if (canPlace(rects, stack, id, { x: c.x, y: c.y, w: cur.w, h: cur.h })) return { x: c.x, y: c.y };
  }
  return { x: last.x, y: last.y };
}

/** Như moveOver nhưng cho kéo tay nắm đổi cỡ phòng `id` (góc trên trái đứng yên); không đè được thì giữ cỡ `last`. */
export function resizeOver(rects: Readonly<Record<RoomId, AptRect>>, stack: readonly RoomId[], id: RoomId, last: { w: number; h: number }, want: { w: number; h: number }, snap: boolean): { w: number; h: number } {
  const cur = rects[id];
  const s = snapSize(rects, id, want, snap);
  for (const c of [s, { w: s.w, h: last.h }, { w: last.w, h: s.h }]) {
    if (canPlace(rects, stack, id, { x: cur.x, y: cur.y, w: c.w, h: c.h })) return { w: c.w, h: c.h };
  }
  return { w: last.w, h: last.h };
}

/**
 * Chỗ đặt một phòng mới rộng w, cao h tại góc trên trái `want` (nơi thả chuột): bám lưới, được đè lên phòng khác (phòng mới nằm trên)
 * miễn mỗi phòng còn thấy ít nhất MIN_VISIBLE. Không được thì null (khi đó dùng roomSpot để tìm chỗ trống).
 */
export function spotOver(rects: Readonly<Record<RoomId, AptRect>>, stack: readonly RoomId[], w: number, h: number, want: { x: number; y: number }, snap: boolean): { x: number; y: number } | null {
  const x = snap ? Math.round(want.x / APT_GRID) * APT_GRID : round(want.x);
  const y = snap ? Math.round(want.y / APT_GRID) * APT_GRID : round(want.y);
  return canPlace(rects, stack, '', { x, y, w, h }) ? { x, y } : null;
}

/**
 * Thứ tự lớp (z) mà phòng `id` cần có sau khi dời hoặc đổi cỡ: chồng lên phòng nào thì nằm trên phòng đó (z lớn hơn z lớn nhất của chúng,
 * giữ nguyên nếu đã nằm trên); không chồng phòng nào thì giữ z đang có. Trả về undefined nghĩa là z = 0.
 */
export function zOnTop(rects: Readonly<Record<RoomId, AptRect>>, plan: AptPlan, id: RoomId): number | undefined {
  const cur = plan[id]?.z ?? 0;
  const under = Object.values(rects).filter((r) => r.id !== id && overlaps(rects[id], r));
  if (!under.length) return cur || undefined;
  const z = Math.max(cur, Math.max(...under.map((r) => plan[r.id]?.z ?? 0)) + 1);
  return z || undefined;
}

/** Khung nhìn của một phòng trong hệ tọa độ căn hộ: khung của riêng phòng (kể cả lề) dịch tới chỗ phòng nằm. */
export function roomViewInApartment(rect: AptRect, local: Bounds): Bounds {
  return { x: rect.x + local.x, y: rect.y + local.y, w: local.w, h: local.h };
}

/** Một phòng thu nhỏ: sàn, tường, cửa và đồ (chưa có chữ, kích thước, hay chi tiết chọn). */
function roomMini(room: AptRoom): string {
  const { layout: L, geo: R } = room;
  const { W, H } = R;
  const o: string[] = [];
  o.push(`<rect x="0" y="0" width="${W}" height="${H}" style="fill:${L.floor}"/>`);
  o.push(`<path fill-rule="evenodd" d="M-10 -10H${W + 10}V${H + 10}H-10Z M0 0V${H}H${W}V0Z" style="fill:${L.wall};stroke:${INK};stroke-opacity:.7;stroke-width:1"/>`);
  for (const d of R.windows) {
    const g = windowGeom(R, d);
    o.push(`<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" style="fill:#BFD7E3;stroke:${INK};stroke-width:.8"/>`);
  }
  for (const d of R.doors) {
    const g = doorGeom(R, d);
    o.push(`<rect x="${g.gap.x}" y="${g.gap.y}" width="${g.gap.w}" height="${g.gap.h}" style="fill:${L.floor}"/>`);
    o.push(`<path d="M${g.e[0]} ${g.e[1]}A${g.w} ${g.w} 0 0 ${g.sweep} ${g.t[0]} ${g.t[1]}M${g.s[0]} ${g.s[1]}L${g.t[0]} ${g.t[1]}" style="fill:none;stroke:${INK};stroke-width:1.2"/>`);
  }
  for (const it of [...L.items].sort((a, b) => a.z - b.z)) {
    o.push(
      `<rect transform="translate(${n2(it.x)} ${n2(it.y)}) rotate(${n2(it.rot)})" x="${-it.w / 2}" y="${-it.d / 2}" width="${it.w}" height="${it.d}" rx="3" style="fill:${it.color};fill-opacity:${it.z === 0 ? 0.8 : 1};stroke:rgba(21,33,30,.6);stroke-width:1.2"/>`,
    );
  }
  return o.join('');
}

/** Vẽ đủ đồ và cửa của từng phòng (sửa được ngay trên mô hình) thay cho hình thu nhỏ. */
export interface ApartmentItems {
  reg: Registry;
  /** Phòng hiện tại của app: chỉ phòng này có món hoặc cửa đang chọn. */
  room: RoomId | null;
  sel: Selection | null;
  opening: OpeningSel | null;
  /** Hiện kích thước trong món và khoảng cách tới tường của món đang chọn. */
  dim: boolean;
  /** Kích thước chi tiết của món đang chọn. */
  detail: boolean;
}

export interface ApartmentView {
  /** Vị trí đã chốt của từng phòng; phòng nào chưa có thì tự xếp lưới. */
  plan?: AptPlan;
  /** Đang bật chỉnh bố cục: kéo phòng để dời, kéo tay nắm để đổi cỡ (đồ không kéo được lúc này). */
  edit?: boolean;
  /** Phòng đang chọn. Có tay nắm đổi cỡ và số đo trên cạnh khi đang chỉnh bố cục. */
  selected?: RoomId | null;
  /** Có thì vẽ đủ đồ và cửa (sửa được); không có thì vẽ hình thu nhỏ. */
  items?: ApartmentItems;
}

/** Cạnh vuông của tay nắm kéo (cm) theo cỡ khung nhìn, để tay nắm to vừa phải dù căn nhỏ hay lớn. */
export function handleSize(bounds: Bounds): number {
  return Math.max(16, Math.min(40, bounds.w / 40));
}

/** Ba tay nắm đổi cỡ của phòng đang chọn: cạnh phải ("r"), cạnh dưới ("b"), góc dưới phải ("br"); tọa độ theo hệ của phòng. */
function handlesSvg(W: number, H: number, hs: number): string {
  const one = (kind: string, cx: number, cy: number, cursor: string): string =>
    `<rect class="apthandle" data-handle="${kind}" x="${n2(cx - hs / 2)}" y="${n2(cy - hs / 2)}" width="${n2(hs)}" height="${n2(hs)}" rx="${n2(hs * 0.25)}" style="cursor:${cursor}"/>`;
  return one('r', W, H / 2, 'ew-resize') + one('b', W / 2, H, 'ns-resize') + one('br', W, H, 'nwse-resize');
}

/**
 * Mô hình cả căn hộ nhìn từ trên: các phòng xếp theo vị trí đã chốt (hoặc lưới tự xếp), mỗi phòng là một nhóm bấm được
 * (class "aptroom", data-room) gồm hình thu nhỏ, tên phòng, kích thước và vùng bấm phủ cả phòng.
 * Khi chỉnh bố cục, phòng đang chọn có viền, số đo rộng và dài ngay trên cạnh, và ba tay nắm đổi cỡ.
 */
export function renderApartment(rooms: readonly AptRoom[], view: ApartmentView = {}): Frame {
  const sizes = Object.fromEntries(rooms.map((r) => [r.id, { W: r.geo.W, H: r.geo.H }])) as Record<RoomId, { W: number; H: number }>;
  const { rects, footprint, bounds, stack } = apartmentRects(
    sizes,
    rooms.map((r) => r.id),
    view.plan,
    Object.fromEntries(rooms.map((r) => [r.id, r.type])),
  );
  const hs = handleSize(bounds);
  // phòng nằm trên che phòng nằm dưới ("khuyết" góc): covers là các hộp che từng phòng, theo tọa độ căn hộ
  const covers = coversOf(rects, stack);
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const o: string[] = [];
  const pad = APT_GAP / 2;
  o.push(`<rect class="aptbase" x="${n2(footprint.x - pad)}" y="${n2(footprint.y - pad)}" width="${n2(footprint.w + 2 * pad)}" height="${n2(footprint.h + 2 * pad)}" rx="${pad / 2}"/>`);
  let items = 0;
  // diện tích trong nhà: phòng (phần còn thấy) cộng khoảng trống kín giữa các phòng (hành lang), vẽ thành nền riêng dưới các phòng
  const interior = interiorSpace(stack.map((id) => rects[id]!));
  const total = interior.total;
  if (interior.bands.length) {
    o.push(`<g class="aptinterior">${interior.bands.map((b) => `<rect x="${n2(b.x)}" y="${n2(b.y)}" width="${n2(b.w)}" height="${n2(b.h)}"/>`).join('')}</g>`);
  }
  // món chồng lấn, nằm ngoài phòng hoặc chắn cửa, và cửa chồng nhau: chỉ tính khi vẽ đủ đồ
  const problems: { name: string; n: number }[] = [];
  // món của phòng bên dưới bị phòng khác che: vẽ lại thành lớp bóng nằm trên cùng để còn thấy và dời ra được
  const buried: { name: string; n: number }[] = [];
  // phòng bị che gần hết (ví dụ vừa gõ cỡ phòng khác quá lớn): báo để người dùng dời hoặc thu nhỏ phòng che
  const hidden: string[] = [];
  const ghosts: string[] = [];
  for (const id of stack) {
    const room = byId.get(id)!;
    const r = rects[id]!;
    const { W, H } = room.geo;
    const local = covers[id]!.map((c) => ({ x: c.x - r.x, y: c.y - r.y, w: c.w, h: c.h }));
    const visible = uncoveredArea({ x: 0, y: 0, w: W, h: H }, local);
    const area = visible / 10000;
    if (local.length && visible < MIN_VISIBLE) hidden.push(room.name);
    const picked = view.selected === room.id;
    const handles = !!view.edit && picked;
    items += room.layout.items.length + room.layout.walls.T.length + room.layout.walls.R.length + room.layout.walls.B.length + room.layout.walls.L.length;
    const it = view.items;
    let body: string;
    if (it) {
      const mine = it.room === room.id;
      const pin = { layout: room.layout, R: room.geo, reg: it.reg, sel: mine ? it.sel : null, opening: mine ? it.opening : null, dim: it.dim, detail: it.detail, compact: true } as const;
      body = renderPlan(pin).svg;
      const n = analysePlan(room.layout, room.geo, it.reg).bad.size + overlappingOpenings(room.geo).size;
      if (n > 0) problems.push({ name: room.name, n });
      if (local.length) {
        const hidden = room.layout.items.filter((f) => {
          const b = boxOf(f);
          return local.some((c) => b.x0 < c.x + c.w && b.x1 > c.x && b.y0 < c.y + c.h && b.y1 > c.y);
        }).length;
        if (hidden) buried.push({ name: room.name, n: hidden });
        ghosts.push(
          `<clipPath id="aptcut-${room.id}">${local.map((c) => `<rect x="${n2(c.x)}" y="${n2(c.y)}" width="${n2(c.w)}" height="${n2(c.h)}"/>`).join('')}</clipPath>` +
            `<g class="aptghost" data-room="${room.id}"><g transform="translate(${n2(r.x)} ${n2(r.y)})"><g clip-path="url(#aptcut-${room.id})">${renderPlan({ ...pin, layer: 'things' }).svg}</g></g></g>`,
        );
      }
    } else {
      body = roomMini(room);
    }
    const fs = Math.max(14, Math.min(28, Math.min(W, H) / 12));
    const label = `${tn(room.name)}, ${W} × ${H} cm, ${fm(area)} m². ${view.edit ? t('Kéo để dời phòng, bấm đúp để thiết kế phòng này') : t('Bấm để chọn, bấm đúp để thiết kế phòng này')}`;
    o.push(
      `<g class="aptroom" data-room="${room.id}"${picked ? ' data-selected="true"' : ''}${local.length ? ' data-carved="true"' : ''} tabindex="0" role="button" aria-label="${escapeHtml(label)}">` +
        `<g transform="translate(${n2(r.x)} ${n2(r.y)})">` +
        body +
        // khung chỉ để tô sáng phòng khi trỏ hoặc chọn; không nhận chuột để đồ và cửa bên dưới bấm được
        `<rect class="apthit" x="-10" y="-10" width="${W + 20}" height="${H + 20}" rx="6"/>` +
        // tên và cỡ phòng nằm phía trên tường trên, trong khoảng hành lang giữa các phòng; phòng bị khuyết ghi diện tích còn lại
        `<text class="aptname" x="0" y="${n2(-(10 + fs * 0.95))}" font-size="${n2(fs)}" font-weight="700">${escapeHtml(tn(room.name))}</text>` +
        `<text class="aptsize" x="0" y="${n2(-14)}" font-size="${n2(fs * 0.62)}" font-family="JetBrains Mono,monospace">${W} × ${H} cm · ${fm(area)} m²</text>` +
        (handles ? edgeTag(W / 2, H, 0, fm(W), 'w', W) + edgeTag(W, H / 2, 90, fm(H), 'h', H) + handlesSvg(W, H, hs) : '') +
        `</g></g>`,
    );
  }
  o.push(...ghosts);
  // "4 phòng · 60,2 m² (gồm 11,8 m² hành lang)": diện tích trong nhà, kể cả khoảng trống kín giữa các phòng
  const sizeText = `${t('{n} phòng', { n: rooms.length })} · ${fm(total)} m²${interior.gaps >= 0.05 ? ` ${t('(gồm {area} m² hành lang)', { area: fm(interior.gaps) })}` : ''}`;
  const nProblems = problems.reduce((a, b) => a + b.n, 0);
  const where = problems.map((x) => tn(x.name)).join(', ');
  const nBuried = buried.reduce((a, b) => a + b.n, 0);
  let status: Frame['status'];
  if (hidden.length) {
    status = { tone: 'bad', text: t('{names} bị phòng khác che gần hết (còn dưới {area} m²). Hãy dời hoặc thu nhỏ phòng đang che.', { names: hidden.map(tn).join(', '), area: fm(MIN_VISIBLE / 10000) }) };
  } else if (nBuried) {
    status = { tone: 'bad', text: t('{n} món của {names} nằm dưới phòng khác (bóng viền cam), hãy kéo ra khỏi chỗ bị che.', { n: nBuried, names: buried.map((x) => tn(x.name)).join(', ') }) };
  } else if (nProblems) {
    status = { tone: 'bad', text: t('{n} chỗ đang chồng lấn, nằm ngoài phòng hoặc chắn cửa (viền cam), ở: {where}.', { n: nProblems, where }) };
  } else if (view.edit) {
    status = {
      tone: 'good',
      text: t('Chỉnh bố cục: kéo phòng để dời, kéo tay nắm để đổi cỡ; phòng kéo sau nằm trên và khuyết phòng bị đè. {size}.', { size: sizeText }),
    };
  } else if (view.items) {
    status = {
      tone: 'good',
      text: t('Kéo đồ vào phòng, bấm đồ để sửa, bấm đúp phòng để zoom vào. {size} · {n} món.', { size: sizeText, n: items }),
    };
  } else {
    status = { tone: 'good', text: t('Bấm vào một phòng trên mô hình để phóng to và thiết kế. {size} · {n} món đồ.', { size: sizeText, n: items }) };
  }
  return {
    bounds,
    aria: `${t('Mô hình căn hộ gồm {n} phòng.', { n: rooms.length })} ${view.edit ? t('Đang chỉnh bố cục: kéo phòng để dời, kéo tay nắm để đổi kích thước') : t('Bấm vào phòng để chọn, bấm đúp để thiết kế phòng đó')}`,
    svg: o.join(''),
    title: t('Cả căn hộ'),
    size: t('{n} phòng', { n: rooms.length }),
    area: `${fm(total)} m²`,
    status,
  };
}
