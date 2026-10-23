import { analyseWall, openingKey, overlappingOpenings } from '../core/analyse';
import { textOn } from '../core/color';
import { escapeHtml, fm } from '../core/format';
import { boxOf, clamp, planToWall, posFromRange, wallLength, wallRect, type RoomSize } from '../core/geometry';
import { floorHeight } from '../core/layout';
import { LIMITS } from '../core/limits';
import { wallGaps } from '../core/measure';
import type { Registry } from '../core/registry';
import type { RoomGeo } from '../core/room';
import type { Layout, OpeningSel, Selection } from '../core/types';
import { WALL_NAMES } from '../data/walls';
import type { OpeningDef, WallKey } from '../data/schema';
import { MARGIN, type Frame } from './frame';
import type { Grab } from './plan';
import { edgeTag, gridLines, hdim, lockGlyph, n2, openingLabel, openingOpen, pickLabel, vdim } from './svg';

export interface ElevationInput {
  layout: Layout;
  R: RoomGeo;
  reg: Registry;
  wall: WallKey;
  sel: Selection | null;
  /** Cửa đi hoặc cửa sổ đang chọn. */
  opening?: OpeningSel | null;
  dim: boolean;
  /** Kích thước chi tiết của món đang chọn, nhãn nằm ngay trên từng cạnh. */
  detail?: boolean;
}

const INK = '#15211E';
const ACCENT = 'var(--accent)';

/** Đồ sàn trong phạm vi này (cm) cách tường thì hiện mờ nét đứt trên mặt đứng. */
const GHOST_RANGE = 100;

export function renderElevation(i: ElevationInput): Frame {
  const { layout: L, R, reg, wall: wl, dim } = i;
  const len = wallLength(R, wl);
  const C = R.ceil;
  const Y = (v: number): number => C - v;
  const selUid = i.sel?.scope === wl ? i.sel.uid : null;
  const info = analyseWall(L, R, wl);
  const list = L.walls[wl];
  const o: string[] = [];

  o.push(`<rect x="0" y="0" width="${len}" height="${C}" style="fill:${L.wall}"/>`);
  o.push(gridLines(len, C, true));
  o.push(`<rect x="-10" y="${C}" width="${len + 20}" height="10" style="fill:${L.floor};stroke:${INK};stroke-width:.8"/>`);
  o.push(`<rect x="-10" y="-10" width="${len + 20}" height="10" style="fill:#B8C0BD"/>`);
  o.push(
    `<rect x="-10" y="0" width="10" height="${C}" style="fill:${L.wall};stroke:${INK};stroke-opacity:.7;stroke-width:.8"/>` +
      `<rect x="${len}" y="0" width="10" height="${C}" style="fill:${L.wall};stroke:${INK};stroke-opacity:.7;stroke-width:.8"/>`,
  );

  for (const g of R.guides) {
    o.push(`<path d="M0 ${Y(g.y)}H${len}" style="stroke:${INK};stroke-opacity:.45;stroke-width:1;stroke-dasharray:6 4"/>`);
    o.push(`<text x="4" y="${Y(g.y) - 3}" font-size="8" font-family="JetBrains Mono,monospace" style="fill:${INK};opacity:.7">${escapeHtml(g.label)}</text>`);
  }

  // cửa đi, cửa sổ: chồng lên nhau thì viền cam, đang chọn thì viền xanh
  const overlap = overlappingOpenings(R);
  for (const p of info.openings) {
    const w = p.x1 - p.x0;
    const h = p.y1 - p.y0;
    const bad = overlap.has(openingKey(p));
    const picked = i.opening?.kind === p.kind && i.opening.uid === p.uid;
    const col = bad ? 'var(--warn)' : picked ? ACCENT : INK;
    const sw = bad || picked ? 3 : 1.4;
    const inner =
      p.kind === 'win'
        ? `<rect x="${p.x0}" y="${Y(p.y1)}" width="${w}" height="${h}" style="fill:#BFD7E3;stroke:${col};stroke-width:${sw}"/>` + `<path d="M${p.x0 + w / 2} ${Y(p.y1)}V${Y(p.y0)}" style="stroke:${col};stroke-width:1"/>`
        : `<rect x="${p.x0}" y="${Y(p.y1)}" width="${w}" height="${h}" style="fill:#C9A27E;stroke:${col};stroke-width:${sw}"/>` + `<circle cx="${p.handle === 'left' ? p.x0 + 8 : p.x1 - 8}" cy="${Y(100)}" r="3" style="fill:${INK}"/>`;
    o.push(openingOpen(p.kind, p.uid, openingLabel(p.kind, { wall: wl, w })) + inner + `</g>`);
  }

  // đồ đứng sàn gần tường: hiện mờ để biết đồ gắn tường có vướng không
  for (const it of L.items) {
    if (it.z === 0) continue;
    const p = planToWall(R, wl, boxOf(it));
    if (p.dist > GHOST_RANGE) continue;
    const hh = floorHeight(it, reg);
    const wd = p.s1 - p.s0;
    o.push(
      `<rect x="${n2(p.s0)}" y="${Y(hh)}" width="${n2(wd)}" height="${hh}" style="fill:${it.color};fill-opacity:.4;stroke:${INK};stroke-opacity:.55;stroke-width:1;stroke-dasharray:4 3"/>`,
    );
    if (wd >= 60 && hh >= 24) {
      o.push(`<text x="${n2(p.s0 + wd / 2)}" y="${Y(hh) + 12}" text-anchor="middle" font-size="8" style="fill:${INK};opacity:.7">${escapeHtml(it.name)} (sàn)</text>`);
    }
  }

  for (const it of list) {
    const r = wallRect(it);
    const bad = info.bad.has(it.uid);
    const selected = it.uid === selUid;
    const stroke = bad ? 'var(--warn)' : selected ? ACCENT : 'rgba(21,33,30,.6)';
    const tc = textOn(it.color);
    const short = reg.resolve(it.id)?.short;
    const lb = pickLabel(it.name, short, it.w, it.h);
    const cx = it.x;
    const cy = Y(it.y + it.h / 2);
    let t = '';
    if (lb?.rot) {
      t += `<text transform="translate(${n2(cx)} ${n2(cy + 3)}) rotate(-90)" text-anchor="middle" font-size="9" font-weight="600" style="fill:${tc};pointer-events:none">${escapeHtml(lb.t)}</text>`;
    } else if (lb) {
      t += `<text x="${n2(cx)}" y="${n2(cy + (it.h >= 40 ? -1 : 3))}" text-anchor="middle" font-size="9" font-weight="600" style="fill:${tc};pointer-events:none">${escapeHtml(lb.t)}</text>`;
      if (dim && it.w >= 60 && it.h >= 40) {
        t += `<text x="${n2(cx)}" y="${n2(cy + 10)}" text-anchor="middle" font-size="8" font-family="JetBrains Mono,monospace" style="fill:${tc};opacity:.8;pointer-events:none">${fm(it.w)}×${fm(it.h)}</text>`;
      }
    }
    const lock = it.locked ? lockGlyph(r.x0 + 9, Y(r.y1) + 9, 0) : '';
    o.push(
      `<g class="it" data-uid="${it.uid}" tabindex="0" role="button" aria-label="${escapeHtml(it.name)}, ${fm(it.w)} x ${fm(it.h)} cm, cao ${fm(it.y)} cm so với sàn${it.locked ? ', đã khóa' : ''}" style="cursor:${it.locked ? 'pointer' : 'move'}">` +
        `<rect x="${n2(r.x0)}" y="${n2(Y(r.y1))}" width="${it.w}" height="${it.h}" rx="2" style="fill:${it.color};stroke:${stroke};stroke-width:${bad || selected ? 3 : 1.2}"/>${t}${lock}</g>`,
    );
  }

  o.push(hdim(0, len, -30, `${len} cm`, 'var(--muted)'));
  o.push(vdim(0, C, -30, `${C} cm`, 'var(--muted)', -1));

  const op = i.opening ? info.openings.find((p) => p.kind === i.opening!.kind && p.uid === i.opening!.uid) : undefined;
  if (op && dim) {
    o.push(hdim(op.x0, op.x1, Y(op.y1) - 10, `${fm(op.x1 - op.x0)} cm`, ACCENT));
    o.push(wallDistances(op, len, C, Y));
  }

  const sel = selUid === null ? undefined : list.find((x) => x.uid === selUid);
  if (sel && dim) {
    const q = wallRect(sel);
    // nhãn trên cạnh (nếu bật) đã ghi rộng, cao, nên không vẽ thêm hai đường kích thước tách rời
    if (!i.detail) {
      o.push(hdim(q.x0, q.x1, Y(q.y1) - 10, `${fm(sel.w)} cm`, ACCENT));
      o.push(vdim(Y(q.y1), Y(q.y0), q.x1 + 12, `${fm(sel.h)} cm`, ACCENT, 1));
    }
    o.push(wallDistances(q, len, C, Y));
  }
  if (sel && i.detail) {
    // chỉ số, nằm giữa cạnh tương ứng: rộng ở cạnh dưới, cao ở cạnh phải; chữ co theo độ dài cạnh
    const q = wallRect(sel);
    o.push(edgeTag(sel.x, Y(q.y0), 0, fm(sel.w), 'w', sel.w));
    o.push(edgeTag(q.x1, Y((q.y0 + q.y1) / 2), 90, fm(sel.h), 'h', sel.h));
  }

  const nbad = info.bad.size;
  const name = WALL_NAMES[wl];
  const frameStatus: Frame['status'] =
    overlap.size > 0
      ? { tone: 'bad', text: 'Cửa đi hoặc cửa sổ đang chồng lên nhau (viền cam), hãy dời ra xa nhau.' }
      : nbad > 0
      ? { tone: 'bad', text: `${nbad} món chồng lấn, vượt ra ngoài tường hoặc đè lên cửa, cửa sổ.` }
      : {
          tone: 'good',
          text: `Không chồng lấn. Có ${list.length} món trên ${name.toLowerCase()}. Nét đứt là đồ đứng sàn trong phòng, nằm trong 1 m cách tường.`,
        };

  return {
    bounds: { x: -MARGIN, y: -MARGIN, w: len + 2 * MARGIN, h: C + 2 * MARGIN },
    aria: `${name} của ${R.name}, dài ${len} cm, cao ${C} cm`,
    svg: o.join(''),
    title: `${R.name} · ${name}`,
    size: `${len} × ${C} cm`,
    area: `${fm((len * C) / 10000)} m² tường`,
    status: frameStatus,
  };
}

/** Khoảng cách từ món đang chọn tới hai đầu tường và trần, nét đứt. Khoảng tới sàn đã có ở đường kích thước chiều cao. */
function wallDistances(q: { x0: number; x1: number; y0: number; y1: number }, len: number, ceil: number, Y: (v: number) => number): string {
  const g = wallGaps(q, len, ceil);
  const cx = (q.x0 + q.x1) / 2;
  const cy = Y((q.y0 + q.y1) / 2);
  const o: string[] = [];
  if (g.left >= 1) o.push(hdim(0, q.x0, cy, fm(g.left), ACCENT, true));
  if (g.right >= 1) o.push(hdim(q.x1, len, cy, fm(g.right), ACCENT, true));
  if (g.ceiling >= 1) o.push(vdim(Y(ceil), Y(q.y1), cx, fm(g.ceiling), ACCENT, -1, true));
  if (g.floor >= 1) o.push(vdim(Y(q.y0), Y(0), cx, fm(g.floor), ACCENT, -1, true));
  return o.join('');
}

/* ---------- Thao tác kéo (hàm thuần) ---------- */

/** p là điểm con trỏ theo tọa độ SVG (y hướng xuống). Độ lệch dy tính theo độ cao so với sàn (y hướng lên). */
export function grabWall(it: { x: number; y: number }, p: { x: number; y: number }, ceil: number): Grab {
  return { dx: it.x - p.x, dy: ceil - p.y - it.y };
}

/** Vị trí mới (tâm dọc tường, độ cao mép dưới) khi kéo món tới con trỏ p. */
export function dragWall(it: { w: number; h: number }, p: { x: number; y: number }, g: Grab, size: { len: number; ceil: number }, snap: boolean): { x: number; y: number } {
  let ex = p.x + g.dx;
  let ey = size.ceil - p.y - g.dy;
  if (snap) {
    ex = Math.round((ex - it.w / 2) / LIMITS.grid) * LIMITS.grid + it.w / 2;
    ey = Math.round(ey / LIMITS.grid) * LIMITS.grid;
  }
  return { x: clamp(ex, 0, size.len), y: clamp(ey, 0, Math.max(0, size.ceil - it.h)) };
}

/** Chỗ nắm cửa trên mặt đứng: mép trái của cửa (x0) cách con trỏ bao nhiêu cm dọc theo tường. */
export function grabOpeningWall(x0: number, p: { x: number }): number {
  return x0 - p.x;
}

/** pos mới của cửa khi kéo tới con trỏ p trên mặt đứng của tường chứa nó. Bám lưới và kẹp vào tường do moveOpening lo. */
export function dragOpeningWall(R: RoomSize, d: Pick<OpeningDef, 'wall' | 'w'>, p: { x: number }, grab: number): number {
  return posFromRange(R, d.wall, d.w, p.x + grab);
}
