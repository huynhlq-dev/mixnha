import { analysePlan, overlappingOpenings } from '../core/analyse';
import { escapeHtml, fm } from '../core/format';
import { doorGeom, windowGeom } from '../core/geometry';
import type { Registry } from '../core/registry';
import type { RoomGeo } from '../core/room';
import { ROOM_DIM_LIMITS } from '../core/limits';
import type { AptPlan, Layout, OpeningSel, Selection } from '../core/types';
import { ROOM_IDS, type RoomId, type RoomTypeId } from '../data/rooms';
import type { Frame } from './frame';
import { renderPlan } from './plan';
import { edgeTag, n2 } from './svg';
import type { Bounds } from './viewport';

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
export const APT_ORDER: readonly string[] = ['khach', 'bep', 'ngu', 'lamviec', 'wc', 'trong'];
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
): { rects: Record<RoomId, AptRect>; footprint: Bounds; bounds: Bounds } {
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
  return { rects, footprint, bounds: { x: footprint.x - APT_PAD, y: footprint.y - APT_PAD, w: footprint.w + 2 * APT_PAD, h: footprint.h + 2 * APT_PAD } };
}

/** Vị trí hiện tại của mọi phòng (kể cả phòng đang tự xếp), để "chốt" lại trước khi người dùng kéo: từ đó các phòng không tự nhảy khi đổi cỡ. */
export function freezePlan(rects: Readonly<Record<RoomId, AptRect>>): AptPlan {
  const plan: AptPlan = {};
  for (const r of Object.values(rects)) plan[r.id] = { x: r.x, y: r.y };
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
 * Phòng chứa điểm p (theo tọa độ căn hộ, cm). pad mở rộng mỗi phía (ví dụ độ dày tường). Hai phòng chồng nhau thì lấy phòng có tâm gần p hơn.
 * Điểm nằm ngoài mọi phòng (hành lang) thì null.
 */
export function roomAtPoint(rects: Readonly<Record<RoomId, AptRect>>, p: { x: number; y: number }, pad = 0): RoomId | null {
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
 * Chỗ đặt phòng khi kéo tới (x, y) mong muốn. Bật bám lưới: mép trái, trên bám lưới APT_GRID, và được hút vào mép phòng khác
 * (cùng mép, hoặc cách APT_MIN_GAP) khi cách không quá APT_MAGNET. Nếu chỗ đó chạm phòng khác thì thử chỉ đổi x, rồi chỉ đổi y
 * (trượt dọc theo phòng bên cạnh), cuối cùng đứng yên ở chỗ cũ.
 */
export function moveRoom(rects: Readonly<Record<RoomId, AptRect>>, id: RoomId, want: { x: number; y: number }, snap: boolean): { x: number; y: number } {
  const cur = rects[id];
  const others = Object.values(rects).filter((r) => r.id !== id);
  let x = want.x;
  let y = want.y;
  if (snap) {
    const xs = others.flatMap((o) => [o.x, o.x + o.w - cur.w, o.x + o.w + APT_MIN_GAP, o.x - cur.w - APT_MIN_GAP]);
    const ys = others.flatMap((o) => [o.y, o.y + o.h - cur.h, o.y + o.h + APT_MIN_GAP, o.y - cur.h - APT_MIN_GAP]);
    x = nearest(x, xs, APT_MAGNET) ?? Math.round(x / APT_GRID) * APT_GRID;
    y = nearest(y, ys, APT_MAGNET) ?? Math.round(y / APT_GRID) * APT_GRID;
  } else {
    x = round(x);
    y = round(y);
  }
  const at = (nx: number, ny: number): AptRect => ({ ...cur, x: nx, y: ny });
  for (const [nx, ny] of [
    [x, y],
    [x, cur.y],
    [cur.x, y],
  ] as const) {
    if (!clashesAny(at(nx, ny), others)) return { x: nx, y: ny };
  }
  return { x: cur.x, y: cur.y };
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

/**
 * Cỡ phòng khi kéo tay nắm tới (w, h) mong muốn; góc trên trái đứng yên. Kẹp trong khoảng cho phép của phòng (150 đến 1500 cm).
 * Bật bám lưới: cạnh phải, dưới bám lưới APT_GRID và được hút vào mép phòng khác. Chạm phòng khác thì thử chỉ đổi rộng, rồi chỉ đổi cao,
 * cuối cùng giữ cỡ cũ.
 */
export function resizeRoom(rects: Readonly<Record<RoomId, AptRect>>, id: RoomId, want: { w: number; h: number }, snap: boolean): { w: number; h: number } {
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
  w = lim(w, lw);
  h = lim(h, lh);
  const as = (nw: number, nh: number): AptRect => ({ ...cur, w: nw, h: nh });
  for (const [nw, nh] of [
    [w, h],
    [w, cur.h],
    [cur.w, h],
  ] as const) {
    if (!clashesAny(as(nw, nh), others)) return { w: nw, h: nh };
  }
  return { w: cur.w, h: cur.h };
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
  const { rects, footprint, bounds } = apartmentRects(
    sizes,
    rooms.map((r) => r.id),
    view.plan,
    Object.fromEntries(rooms.map((r) => [r.id, r.type])),
  );
  const hs = handleSize(bounds);
  // phòng chồng lên nhau (ví dụ vừa đổi cỡ một phòng): viền cam và báo trong dòng trạng thái
  const clash = new Set<RoomId>();
  const all = Object.values(rects);
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (roomsClash(all[i]!, all[j]!, 0)) {
        clash.add(all[i]!.id);
        clash.add(all[j]!.id);
      }
    }
  }
  const o: string[] = [];
  const pad = APT_GAP / 2;
  o.push(`<rect class="aptbase" x="${n2(footprint.x - pad)}" y="${n2(footprint.y - pad)}" width="${n2(footprint.w + 2 * pad)}" height="${n2(footprint.h + 2 * pad)}" rx="${pad / 2}"/>`);
  let total = 0;
  let items = 0;
  // món chồng lấn, nằm ngoài phòng hoặc chắn cửa, và cửa chồng nhau: chỉ tính khi vẽ đủ đồ
  const problems: { name: string; n: number }[] = [];
  for (const room of rooms) {
    const r = rects[room.id];
    const { W, H } = room.geo;
    const area = (W * H) / 10000;
    const picked = view.selected === room.id;
    const handles = !!view.edit && picked;
    total += area;
    items += room.layout.items.length + room.layout.walls.T.length + room.layout.walls.R.length + room.layout.walls.B.length + room.layout.walls.L.length;
    const it = view.items;
    let body: string;
    if (it) {
      const mine = it.room === room.id;
      body = renderPlan({ layout: room.layout, R: room.geo, reg: it.reg, sel: mine ? it.sel : null, opening: mine ? it.opening : null, dim: it.dim, detail: it.detail, compact: true }).svg;
      const n = analysePlan(room.layout, room.geo, it.reg).bad.size + overlappingOpenings(room.geo).size;
      if (n > 0) problems.push({ name: room.name, n });
    } else {
      body = roomMini(room);
    }
    const fs = Math.max(14, Math.min(28, Math.min(W, H) / 12));
    const label = `${room.name}, ${W} × ${H} cm, ${fm(area)} m². ${view.edit ? 'Kéo để dời phòng, bấm đúp để thiết kế phòng này' : 'Bấm để chọn, bấm đúp để thiết kế phòng này'}`;
    o.push(
      `<g class="aptroom" data-room="${room.id}"${picked ? ' data-selected="true"' : ''}${clash.has(room.id) ? ' data-clash="true"' : ''} tabindex="0" role="button" aria-label="${escapeHtml(label)}">` +
        `<g transform="translate(${n2(r.x)} ${n2(r.y)})">` +
        body +
        // khung chỉ để tô sáng phòng khi trỏ, chọn hoặc chồng nhau; không nhận chuột để đồ và cửa bên dưới bấm được
        `<rect class="apthit" x="-10" y="-10" width="${W + 20}" height="${H + 20}" rx="6"/>` +
        // tên và cỡ phòng nằm phía trên tường trên, trong khoảng hành lang giữa các phòng
        `<text class="aptname" x="0" y="${n2(-(10 + fs * 0.95))}" font-size="${n2(fs)}" font-weight="700">${escapeHtml(room.name)}</text>` +
        `<text class="aptsize" x="0" y="${n2(-14)}" font-size="${n2(fs * 0.62)}" font-family="JetBrains Mono,monospace">${W} × ${H} cm · ${fm(area)} m²</text>` +
        (handles ? edgeTag(W / 2, H, 0, fm(W), 'w', W) + edgeTag(W, H / 2, 90, fm(H), 'h', H) + handlesSvg(W, H, hs) : '') +
        `</g></g>`,
    );
  }
  const nProblems = problems.reduce((a, b) => a + b.n, 0);
  const where = problems.map((x) => x.name).join(', ');
  let status: Frame['status'];
  if (clash.size) {
    status = { tone: 'bad', text: `Có phòng đang chồng lên nhau (viền cam). Bật "Chỉnh bố cục" rồi kéo phòng ra xa nhau, hoặc thu nhỏ phòng.` };
  } else if (nProblems) {
    status = { tone: 'bad', text: `${nProblems} chỗ đang chồng lấn, nằm ngoài phòng hoặc chắn cửa (viền cam), ở: ${where}.` };
  } else if (view.edit) {
    status = {
      tone: 'good',
      text: `Chỉnh bố cục căn hộ: kéo phòng để dời, kéo tay nắm ở cạnh phải, cạnh dưới hoặc góc dưới phải của phòng đang chọn để đổi kích thước. Căn hộ có ${rooms.length} phòng, ${fm(total)} m² sàn.`,
    };
  } else if (view.items) {
    status = {
      tone: 'good',
      text: `Kéo đồ từ thư viện thả vào phòng, bấm đồ để sửa, kéo sang phòng khác để chuyển, bấm đúp một phòng để zoom vào. ${rooms.length} phòng, ${fm(total)} m², ${items} món.`,
    };
  } else {
    status = { tone: 'good', text: `Bấm vào một phòng trên mô hình để phóng to và thiết kế. Căn hộ có ${rooms.length} phòng, ${fm(total)} m² sàn, ${items} món đồ.` };
  }
  return {
    bounds,
    aria: `Mô hình căn hộ gồm ${rooms.length} phòng. ${view.edit ? 'Đang chỉnh bố cục: kéo phòng để dời, kéo tay nắm để đổi kích thước' : 'Bấm vào phòng để chọn, bấm đúp để thiết kế phòng đó'}`,
    svg: o.join(''),
    title: 'Cả căn hộ',
    size: `${rooms.length} phòng`,
    area: `${fm(total)} m²`,
    status,
  };
}
