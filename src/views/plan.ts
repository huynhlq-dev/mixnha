import { analysePlan, MIN_LANE, openingKey, overlappingOpenings } from '../core/analyse';
import { textOn } from '../core/color';
import { fm, escapeHtml } from '../core/format';
import { alongWall, boxOf, clamp, doorGeom, nearestWall, snapAngle, wallLength, windowGeom, type Box, type Placed, type RoomSize } from '../core/geometry';
import { canEdit } from '../core/layout';
import { LIMITS } from '../core/limits';
import { planGaps } from '../core/measure';
import type { Registry } from '../core/registry';
import type { RoomGeo } from '../core/room';
import type { DoorItem, FloorItem, Layout, OpeningKind, OpeningSel, Selection } from '../core/types';
import type { OpeningDef, WallKey } from '../data/schema';
import { MARGIN, type Frame } from './frame';
import { edgeTag, gridLines, hdim, HALO, lockGlyph, n2, openingLabel, openingOpen, pickLabel, vdim } from './svg';
import { t, tn } from '../i18n';

export interface PlanInput {
  layout: Layout;
  R: RoomGeo;
  reg: Registry;
  sel: Selection | null;
  /** Cửa đi hoặc cửa sổ đang chọn. */
  opening?: OpeningSel | null;
  /** Hiện kích thước và khoảng cách tới tường. */
  dim: boolean;
  /** Kích thước chi tiết của món đang chọn, nhãn nằm ngay trên từng cạnh. */
  detail?: boolean;
  /** Vẽ gọn để đặt vào mô hình cả căn hộ: không lưới, không đường kích thước tổng của phòng, không vạch lối đi hẹp nhất. */
  compact?: boolean;
  /** "things": chỉ vẽ cửa và đồ (không sàn, tường, lan can), dùng làm lớp bóng của phần phòng bị phòng khác che. Mặc định "all". */
  layer?: 'all' | 'things';
}

const INK = '#15211E';
const ACCENT = 'var(--accent)';
/** Vùng bấm quanh cửa rộng hơn hình vẽ thêm bấy nhiêu cm mỗi phía, để dễ trúng khi bản vẽ thu nhỏ. */
const HIT_PAD = 8;

/** Vùng bấm trong suốt quanh hình chữ nhật g của cửa. */
function hitRect(g: { x: number; y: number; w: number; h: number }): string {
  return `<rect x="${g.x - HIT_PAD}" y="${g.y - HIT_PAD}" width="${g.w + 2 * HIT_PAD}" height="${g.h + 2 * HIT_PAD}" style="fill:transparent"/>`;
}

/** Độ dày tường vẽ quanh phòng (cm), cùng giá trị với geometry.ts. */
const WALL_THICK = 10;

/** Cánh cửa mở ra ngoài quét vòng ngoài tường: mỗi tường cần chừa bấy nhiêu cm (kể cả độ dày tường), nếu không cánh bị cắt khỏi khung. */
function outReach(R: RoomGeo): Record<WallKey, number> {
  const reach: Record<WallKey, number> = { T: 0, R: 0, B: 0, L: 0 };
  for (const d of R.doors) if (d.swing === 'out') reach[d.wall] = Math.max(reach[d.wall], WALL_THICK + d.w);
  return reach;
}

/**
 * Đường kích thước của cửa đang chọn, vẽ trong phòng sát tường: chiều rộng cửa và khoảng cách từ hai đầu cửa tới hai góc.
 * Tường trên, dưới đo từ góc trái; tường trái, phải đo từ góc trên (cùng cách tính với pos).
 */
function openingDims(R: RoomSize, d: OpeningDef): string {
  const len = wallLength(R, d.wall);
  const end = d.pos + d.w;
  const horizontal = d.wall === 'T' || d.wall === 'B';
  const at = d.wall === 'T' || d.wall === 'L' ? 16 : (horizontal ? R.H : R.W) - 16;
  const side = d.wall === 'L' ? 1 : -1;
  const seg = (a: number, b: number, txt: string, col: string, dashed: boolean): string => (horizontal ? hdim(a, b, at, txt, col, dashed) : vdim(a, b, at, txt, col, side, dashed));
  return (
    (d.pos >= 1 ? seg(0, d.pos, fm(d.pos), ACCENT, true) : '') + seg(d.pos, end, `${fm(d.w)} cm`, ACCENT, false) + (len - end >= 1 ? seg(end, len, fm(len - end), ACCENT, true) : '')
  );
}

/** Khoảng cách giữa hai trụ lan can trên mặt bằng (cm). */
const RAIL_POST_GAP = 40;

/**
 * Lan can thay cho tường ở các cạnh `rails`: xóa dải tường dày 10 cm ở cạnh đó (trả lại màu sàn), vẽ một nét lan can mảnh nằm giữa dải
 * kèm các trụ nhỏ. Bốn ô vuông ở góc vẫn còn, như trụ góc.
 */
function railsSvg(R: RoomSize, rails: readonly WallKey[], floor: string): string {
  const { W, H } = R;
  const post = (x: number, y: number): string => `M${n2(x - 2.5)} ${n2(y - 2.5)}h5v5h-5z`;
  const o: string[] = [];
  for (const wl of rails) {
    const horizontal = wl === 'T' || wl === 'B';
    const len = horizontal ? W : H;
    const c = wl === 'T' || wl === 'L' ? -5 : (horizontal ? H : W) + 5;
    const band = horizontal ? `x="0" y="${n2(c - 5.5)}" width="${W}" height="11"` : `x="${n2(c - 5.5)}" y="0" width="11" height="${H}"`;
    let posts = '';
    for (let s = 0; s < len; s += RAIL_POST_GAP) posts += horizontal ? post(s, c) : post(c, s);
    posts += horizontal ? post(len, c) : post(c, len);
    const line = horizontal ? `M0 ${c}H${len}` : `M${c} 0V${len}`;
    o.push(`<rect ${band} style="fill:${floor}"/><path d="${line}" style="fill:none;stroke:${INK};stroke-width:1.6"/><path d="${posts}" style="fill:${INK}"/>`);
  }
  return o.join('');
}

/** Nhãn trong món: tên (hoặc tên ngắn) và, nếu đủ chỗ, kích thước rộng × sâu. */
function itemLabel(it: FloorItem, box: Box, short: string | undefined, dim: boolean, tc: string): string {
  const lb = pickLabel(it.name, short, box.w, box.h);
  const withDims = !!lb && !lb.rot && dim && box.w >= 70 && box.h >= 30;
  let s = '';
  if (lb?.rot) {
    s += `<text transform="rotate(-90) translate(0 3)" text-anchor="middle" font-size="9" font-weight="600" style="fill:${tc};pointer-events:none">${escapeHtml(lb.t)}</text>`;
  } else if (lb) {
    s += `<text y="${withDims ? -2 : 3}" text-anchor="middle" font-size="9" font-weight="600" style="fill:${tc};pointer-events:none">${escapeHtml(lb.t)}</text>`;
  }
  if (withDims) {
    s += `<text y="9" text-anchor="middle" font-size="8" font-family="JetBrains Mono,monospace" style="fill:${tc};opacity:.8;pointer-events:none">${fm(it.w)}×${fm(it.d)}</text>`;
  }
  return s;
}

/**
 * Kích thước chi tiết của món đang chọn: chỉ số, nằm giữa cạnh tương ứng và xoay theo món. Rộng ở cạnh dưới, sâu ở cạnh phải
 * (cạnh trên dành cho tay nắm xoay). Chữ co theo độ dài cạnh nên luôn nhỏ hơn cạnh.
 */
function edgeTags(it: FloorItem): string {
  const a = (it.rot * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const at = (lx: number, ly: number): [number, number] => [it.x + lx * c - ly * s, it.y + lx * s + ly * c];
  return edgeTag(...at(0, it.d / 2), it.rot, fm(it.w), 'w', it.w) + edgeTag(...at(it.w / 2, 0), it.rot + 90, fm(it.d), 'd', it.d);
}

/** Khoảng cách từ món đang chọn tới bốn bức tường, vẽ nét đứt từ mép hộp bao quanh tới tường. */
function wallDistances(b: Box, R: RoomSize): string {
  const g = planGaps(b, R);
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const o: string[] = [];
  if (g.left >= 1) o.push(hdim(0, b.x0, cy, fm(g.left), ACCENT, true));
  if (g.right >= 1) o.push(hdim(b.x1, R.W, cy, fm(g.right), ACCENT, true));
  if (g.top >= 1) o.push(vdim(0, b.y0, cx, fm(g.top), ACCENT, -1, true));
  if (g.bottom >= 1) o.push(vdim(b.y1, R.H, cx, fm(g.bottom), ACCENT, -1, true));
  return o.join('');
}

/** Tay nắm xoay: nhấn giữ rồi kéo quanh món để xoay tự do. */
function rotationHandle(it: FloorItem): string {
  const a = (it.rot * Math.PI) / 180;
  const sn = Math.sin(a);
  const cs = Math.cos(a);
  const hd = it.d / 2;
  const bx = it.x + sn * hd;
  const by = it.y - cs * hd;
  const hx = it.x + sn * (hd + 26);
  const hy = it.y - cs * (hd + 26);
  return (
    `<path d="M${n2(bx)} ${n2(by)}L${n2(hx)} ${n2(hy)}" style="stroke:${ACCENT};stroke-width:1.5;fill:none"/>` +
    `<g class="rot-handle" style="cursor:grab"><circle cx="${n2(hx)}" cy="${n2(hy)}" r="16" style="fill:transparent"/>` +
    `<circle cx="${n2(hx)}" cy="${n2(hy)}" r="8.5" style="fill:${ACCENT};stroke:var(--surface);stroke-width:2"/>` +
    `<path d="M${n2(hx - 3.2)} ${n2(hy - 0.6)}A3.4 3.4 0 1 1 ${n2(hx - 1.2)} ${n2(hy + 3)}" style="fill:none;stroke:var(--accent-ink);stroke-width:1.5;stroke-linecap:round"/></g>` +
    `<text x="${n2(hx + 13)}" y="${n2(hy + 3.5)}" font-size="10" font-family="JetBrains Mono,monospace" style="${HALO}fill:${ACCENT}">${fm(it.rot)}°</text>`
  );
}

export function renderPlan(i: PlanInput): Frame {
  const { layout: L, R, reg, dim } = i;
  const { W, H } = R;
  const things = i.layer === 'things';
  const compact = !!i.compact || things;
  const selUid = i.sel?.scope === 'floor' ? i.sel.uid : null;
  const info = analysePlan(L, R, reg);
  const o: string[] = [];

  if (!things) {
    o.push(`<rect x="0" y="0" width="${W}" height="${H}" style="fill:${L.floor}"/>`);
    if (!compact) o.push(gridLines(W, H));
    o.push(`<path fill-rule="evenodd" d="M-10 -10H${W + 10}V${H + 10}H-10Z M0 0V${H}H${W}V0Z" style="fill:${L.wall};stroke:${INK};stroke-opacity:.7;stroke-width:1"/>`);
    if (R.rails.length) o.push(railsSvg(R, R.rails, L.floor));
  }
  // cửa đi, cửa sổ: chồng lên nhau thì viền cam, đang chọn thì viền xanh
  const overlap = overlappingOpenings(R);
  const opLook = (kind: OpeningKind, d: DoorItem): { col: string; hot: boolean } => {
    const bad = overlap.has(openingKey({ kind, uid: d.uid }));
    const picked = i.opening?.kind === kind && i.opening.uid === d.uid;
    return { col: bad ? 'var(--warn)' : picked ? ACCENT : INK, hot: bad || picked };
  };
  for (const d of R.windows) {
    const g = windowGeom(R, d);
    const { col, hot } = opLook('win', d);
    o.push(
      openingOpen('win', d.uid, openingLabel('win', d)) +
        `<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" style="fill:#BFD7E3;stroke:${col};stroke-width:${hot ? 3 : 0.8}"/>` +
        hitRect(g) +
        `</g>`,
    );
  }
  for (const d of R.doors) {
    const g = doorGeom(R, d);
    const z = g.zone;
    const { col, hot } = opLook('door', d);
    o.push(
      openingOpen('door', d.uid, openingLabel('door', d)) +
        `<rect x="${g.gap.x}" y="${g.gap.y}" width="${g.gap.w}" height="${g.gap.h}" style="fill:${L.floor}${hot ? `;stroke:${col};stroke-width:3` : ''}"/>` +
        `<rect x="${z.x0}" y="${z.y0}" width="${z.x1 - z.x0}" height="${z.y1 - z.y0}" style="fill:none;stroke:${col};stroke-opacity:${hot ? 0.7 : 0.35};stroke-width:1;stroke-dasharray:3 3;pointer-events:none"/>` +
        `<path d="M${g.e[0]} ${g.e[1]}A${g.w} ${g.w} 0 0 ${g.sweep} ${g.t[0]} ${g.t[1]}M${g.s[0]} ${g.s[1]}L${g.t[0]} ${g.t[1]}" style="fill:none;stroke:${col};stroke-width:${hot ? 1.8 : 1.2};pointer-events:none"/>` +
        // hình quạt cánh cửa quét (từ bản lề, qua đầu cánh đóng, theo cung tới đầu cánh mở) cũng bấm chọn được, vì đó là hình cửa mà người dùng thấy;
        // viền trong suốt dày 6 cm để bấm trúng nét cánh và nét cung (chỉ dày 1,2 cm) cũng được
        `<path d="M${g.s[0]} ${g.s[1]}L${g.e[0]} ${g.e[1]}A${g.w} ${g.w} 0 0 ${g.sweep} ${g.t[0]} ${g.t[1]}Z" style="fill:transparent;stroke:transparent;stroke-width:6"/>` +
        hitRect(g.gap) +
        `</g>`,
    );
  }

  for (const it of [...L.items].sort((a, b) => a.z - b.z)) {
    const box = boxOf(it);
    const bad = info.bad.has(it.uid);
    const selected = it.uid === selUid;
    const stroke = bad ? 'var(--warn)' : selected ? ACCENT : 'rgba(21,33,30,.6)';
    const sw = bad || selected ? 3 : 1.2;
    const tc = textOn(it.color);
    const short = reg.resolve(it.id)?.short;
    const lock = it.locked ? lockGlyph(-it.w / 2 + 9, -it.d / 2 + 9, it.rot) : '';
    // món đang chọn có thêm vòng viền màu chính bao ngoài và bóng nhẹ: vẫn thấy được khi viền món đã đổi sang màu cảnh báo
    const ring = selected ? `<rect class="selring" x="${-it.w / 2 - 5}" y="${-it.d / 2 - 5}" width="${it.w + 10}" height="${it.d + 10}" rx="7" style="fill:none;stroke:${ACCENT};stroke-width:2.5"/>` : '';
    o.push(
      `<g class="it"${selected ? ' data-sel="true"' : ''} data-uid="${it.uid}" tabindex="0" role="button" aria-label="${escapeHtml(t('{name}, {w} x {d} cm', { name: tn(it.name), w: fm(it.w), d: fm(it.d) }))}${it.locked ? escapeHtml(t(', đã khóa')) : ''}" transform="translate(${n2(it.x)} ${n2(it.y)}) rotate(${n2(it.rot)})" style="cursor:${it.locked ? 'pointer' : 'move'}">` +
        ring +
        `<rect x="${-it.w / 2}" y="${-it.d / 2}" width="${it.w}" height="${it.d}" rx="3" style="fill:${it.color};fill-opacity:${it.z === 0 ? 0.8 : 1};stroke:${stroke};stroke-width:${sw}"${it.z === 0 ? ' stroke-dasharray="6 4"' : ''}/>` +
        `<g transform="rotate(${n2(-it.rot)})">${itemLabel(it, box, short, dim, tc)}</g>${lock}</g>`,
    );
  }

  if (dim && info.gap && !compact) {
    const g = info.gap;
    const col = g.dist >= MIN_LANE ? 'var(--ok)' : 'var(--warn)';
    o.push(g.horizontal ? hdim(g.x0!, g.x1!, g.y!, fm(g.dist), col) : vdim(g.y0!, g.y1!, g.x!, fm(g.dist), col, 1));
  }
  // đường kích thước tổng nằm ngoài vòng quét của cánh cửa mở ra ngoài (nếu có) ở tường trên và trái
  const reach = outReach(R);
  const dimAt = (side: 'T' | 'L'): number => (reach[side] > 0 ? reach[side] + 14 : 30);
  const margin = (side: WallKey): number => (reach[side] > 0 ? Math.max(MARGIN, (side === 'T' || side === 'L' ? dimAt(side) : reach[side]) + 22) : MARGIN);
  if (!compact) {
    o.push(hdim(0, W, -dimAt('T'), `${W} cm`, 'var(--muted)'));
    o.push(vdim(0, H, -dimAt('L'), `${H} cm`, 'var(--muted)', -1));
  }

  if (dim && i.opening) {
    const od = (i.opening.kind === 'door' ? R.doors : R.windows).find((x) => x.uid === i.opening!.uid);
    if (od) o.push(openingDims(R, od));
  }

  const sel = selUid === null ? undefined : L.items.find((x) => x.uid === selUid);
  if (sel) {
    const rm = sel.rot % 90;
    const axis = Math.abs(rm) < 0.05 || Math.abs(rm - 90) < 0.05;
    const b = boxOf(sel);
    if (dim) {
      // nhãn trên cạnh đã ghi rộng, sâu (cả món xoay chéo), nên không vẽ thêm hai đường kích thước tách rời
      if (axis && !i.detail) {
        o.push(hdim(b.x0, b.x1, b.y1 + 16, `${fm(b.w)} cm`, ACCENT));
        o.push(vdim(b.y0, b.y1, b.x1 + 12, `${fm(b.h)} cm`, ACCENT, 1));
      }
      o.push(wallDistances(b, R));
    }
    if (i.detail) o.push(edgeTags(sel));
    if (canEdit(sel, 'rotate')) o.push(rotationHandle(sel));
  }

  const nbad = info.bad.size;
  let tone: Frame['status']['tone'] = 'good';
  let text: string;
  if (overlap.size > 0) {
    tone = 'bad';
    text = t('Cửa đi hoặc cửa sổ đang chồng lên nhau (viền cam), hãy dời ra xa nhau.');
  } else if (nbad > 0) {
    tone = 'bad';
    text = t('{n} món đang chồng lấn, nằm ngoài phòng hoặc chắn vùng mở cửa (nét đứt).', { n: nbad });
  } else if (info.gap && info.gap.dist < MIN_LANE) {
    tone = 'warn';
    text = t('Lối đi giữa {a} và {b} chỉ rộng {dist} cm. Nên chừa từ {min} cm.', { a: tn(info.gap.a), b: tn(info.gap.b), dist: fm(info.gap.dist), min: MIN_LANE });
  } else if (info.gap) {
    text = t('Không chồng lấn. Lối đi hẹp nhất là {dist} cm, giữa {a} và {b}.', { dist: fm(info.gap.dist), a: tn(info.gap.a), b: tn(info.gap.b) });
  } else {
    text = t('Không chồng lấn.');
  }

  return {
    bounds: { x: -margin('L'), y: -margin('T'), w: W + margin('L') + margin('R'), h: H + margin('T') + margin('B') },
    aria: t('Mặt bằng {room} {W} x {H} cm, {n} món đồ', { room: tn(R.name), W, H, n: L.items.length }),
    svg: o.join(''),
    title: tn(R.name),
    size: `${W} × ${H} cm`,
    area: `${fm((W * H) / 10000)} m²`,
    status: { tone, text: `${text} ${t('Đồ chiếm {pct}% diện tích sàn.', { pct: info.pct })}` },
  };
}

/* ---------- Thao tác kéo, xoay (hàm thuần, không đụng tới DOM) ---------- */

/** Độ lệch giữa con trỏ và tâm món lúc bắt đầu kéo, để món không nhảy theo con trỏ. */
export interface Grab {
  dx: number;
  dy: number;
}

export function grabPlan(it: Pick<FloorItem, 'x' | 'y'>, p: { x: number; y: number }): Grab {
  return { dx: it.x - p.x, dy: it.y - p.y };
}

/**
 * Vị trí mới của món khi kéo tới con trỏ p. Bám lưới là bám mép trái và mép trên của hộp bao quanh
 * (món xoay chéo vẫn có mép thẳng hàng với lưới). Tâm món luôn nằm trong phòng.
 */
export function dragPlan(it: Placed, p: { x: number; y: number }, g: Grab, R: RoomSize, snap: boolean): { x: number; y: number } {
  const b = boxOf(it);
  const hw = b.w / 2;
  const hh = b.h / 2;
  let nx = p.x + g.dx;
  let ny = p.y + g.dy;
  if (snap) {
    nx = Math.round((nx - hw) / LIMITS.grid) * LIMITS.grid + hw;
    ny = Math.round((ny - hh) / LIMITS.grid) * LIMITS.grid + hh;
  }
  return { x: clamp(nx, 0, R.W), y: clamp(ny, 0, R.H) };
}

/** Góc xoay khi kéo tay nắm tới điểm p: món quay sao cho mặt trước (phía trên) hướng về p. */
export function rotationAt(it: Pick<Placed, 'x' | 'y'>, p: { x: number; y: number }, shift: boolean, snapOn: boolean): number {
  return snapAngle((Math.atan2(p.x - it.x, -(p.y - it.y)) * 180) / Math.PI, shift, snapOn);
}

/** Chỗ nắm cửa: con trỏ cách mép gần góc của cửa bao nhiêu cm dọc theo tường, để cửa không nhảy theo con trỏ. */
export function grabOpeningPlan(d: Pick<OpeningDef, 'wall' | 'pos'>, p: { x: number; y: number }): number {
  return alongWall(d.wall, p) - d.pos;
}

/**
 * Chỗ mới của cửa khi kéo tới con trỏ p: tường gần p nhất (còn gần tường cũ thì giữ tường cũ) và vị trí dọc tường.
 * Sang tường khác thì cửa nằm giữa con trỏ. Bám lưới và kẹp vào tường do moveOpening lo.
 */
export function dragOpeningPlan(d: Pick<OpeningDef, 'wall' | 'w'>, p: { x: number; y: number }, grab: number, R: RoomSize): { wall: WallKey; pos: number } {
  const wall = nearestWall(R, p, d.wall);
  return { wall, pos: alongWall(wall, p) - (wall === d.wall ? grab : d.w / 2) };
}
