import { analysePlan, MIN_LANE } from '../core/analyse';
import { textOn } from '../core/color';
import { fm, escapeHtml } from '../core/format';
import { boxOf, clamp, doorGeom, snapAngle, windowGeom, type Box, type Placed, type RoomSize } from '../core/geometry';
import { canEdit } from '../core/layout';
import { LIMITS } from '../core/limits';
import { planGaps } from '../core/measure';
import type { Registry } from '../core/registry';
import type { RoomGeo } from '../core/room';
import type { FloorItem, Layout, Selection } from '../core/types';
import { MARGIN, type Frame } from './frame';
import { gridLines, hdim, HALO, lockGlyph, n2, pickLabel, vdim } from './svg';

export interface PlanInput {
  layout: Layout;
  R: RoomGeo;
  reg: Registry;
  sel: Selection | null;
  /** Hiện kích thước và khoảng cách tới tường. */
  dim: boolean;
}

const INK = '#15211E';
const ACCENT = 'var(--accent)';

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
  const selUid = i.sel?.scope === 'floor' ? i.sel.uid : null;
  const info = analysePlan(L, R, reg);
  const o: string[] = [];

  o.push(`<rect x="0" y="0" width="${W}" height="${H}" style="fill:${L.floor}"/>`);
  o.push(gridLines(W, H));
  o.push(`<path fill-rule="evenodd" d="M-10 -10H${W + 10}V${H + 10}H-10Z M0 0V${H}H${W}V0Z" style="fill:${L.wall};stroke:${INK};stroke-opacity:.7;stroke-width:1"/>`);
  for (const d of R.windows) {
    const g = windowGeom(R, d);
    o.push(`<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" style="fill:#BFD7E3;stroke:${INK};stroke-width:.8"/>`);
  }
  for (const d of R.doors) {
    const g = doorGeom(R, d);
    const z = g.zone;
    o.push(`<rect x="${g.gap.x}" y="${g.gap.y}" width="${g.gap.w}" height="${g.gap.h}" style="fill:${L.floor}"/>`);
    o.push(`<rect x="${z.x0}" y="${z.y0}" width="${z.x1 - z.x0}" height="${z.y1 - z.y0}" style="fill:none;stroke:${INK};stroke-opacity:.35;stroke-width:1;stroke-dasharray:3 3"/>`);
    o.push(`<path d="M${g.e[0]} ${g.e[1]}A${g.w} ${g.w} 0 0 ${g.sweep} ${g.t[0]} ${g.t[1]}M${g.s[0]} ${g.s[1]}L${g.t[0]} ${g.t[1]}" style="fill:none;stroke:${INK};stroke-width:1.2"/>`);
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
    o.push(
      `<g class="it" data-uid="${it.uid}" tabindex="0" role="button" aria-label="${escapeHtml(it.name)}, ${fm(it.w)} x ${fm(it.d)} cm${it.locked ? ', đã khóa' : ''}" transform="translate(${n2(it.x)} ${n2(it.y)}) rotate(${n2(it.rot)})" style="cursor:${it.locked ? 'pointer' : 'move'}">` +
        `<rect x="${-it.w / 2}" y="${-it.d / 2}" width="${it.w}" height="${it.d}" rx="3" style="fill:${it.color};fill-opacity:${it.z === 0 ? 0.8 : 1};stroke:${stroke};stroke-width:${sw}"${it.z === 0 ? ' stroke-dasharray="6 4"' : ''}/>` +
        `<g transform="rotate(${n2(-it.rot)})">${itemLabel(it, box, short, dim, tc)}</g>${lock}</g>`,
    );
  }

  if (dim && info.gap) {
    const g = info.gap;
    const col = g.dist >= MIN_LANE ? 'var(--ok)' : 'var(--warn)';
    o.push(g.horizontal ? hdim(g.x0!, g.x1!, g.y!, fm(g.dist), col) : vdim(g.y0!, g.y1!, g.x!, fm(g.dist), col, 1));
  }
  o.push(hdim(0, W, -30, `${W} cm`, 'var(--muted)'));
  o.push(vdim(0, H, -30, `${H} cm`, 'var(--muted)', -1));

  const sel = selUid === null ? undefined : L.items.find((x) => x.uid === selUid);
  if (sel) {
    const rm = sel.rot % 90;
    const axis = Math.abs(rm) < 0.05 || Math.abs(rm - 90) < 0.05;
    const b = boxOf(sel);
    if (dim) {
      if (axis) {
        o.push(hdim(b.x0, b.x1, b.y1 + 16, `${fm(b.w)} cm`, ACCENT));
        o.push(vdim(b.y0, b.y1, b.x1 + 12, `${fm(b.h)} cm`, ACCENT, 1));
      }
      o.push(wallDistances(b, R));
    }
    if (canEdit(sel, 'rotate')) o.push(rotationHandle(sel));
  }

  const nbad = info.bad.size;
  let tone: Frame['status']['tone'] = 'good';
  let text: string;
  if (nbad > 0) {
    tone = 'bad';
    text = `${nbad} món đang chồng lấn, nằm ngoài phòng hoặc chắn vùng mở cửa (nét đứt).`;
  } else if (info.gap && info.gap.dist < MIN_LANE) {
    tone = 'bad';
    text = `Lối đi giữa ${info.gap.a} và ${info.gap.b} chỉ rộng ${fm(info.gap.dist)} cm. Nên chừa từ ${MIN_LANE} cm.`;
  } else if (info.gap) {
    text = `Không chồng lấn. Lối đi hẹp nhất là ${fm(info.gap.dist)} cm, giữa ${info.gap.a} và ${info.gap.b}.`;
  } else {
    text = 'Không chồng lấn.';
  }

  return {
    bounds: { x: -MARGIN, y: -MARGIN, w: W + 2 * MARGIN, h: H + 2 * MARGIN },
    aria: `Mặt bằng ${R.name} ${W} x ${H} cm, ${L.items.length} món đồ`,
    svg: o.join(''),
    title: R.name,
    size: `${W} × ${H} cm`,
    area: `${fm((W * H) / 10000)} m²`,
    status: { tone, text: `${text} Đồ chiếm ${info.pct}% diện tích sàn.` },
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
