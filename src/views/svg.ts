import { escapeHtml, fm } from '../core/format';
import type { OpeningKind } from '../core/types';
import type { WallKey } from '../data/schema';
import { WALL_NAMES } from '../data/walls';
import { t, tn } from '../i18n';

/** Làm tròn số khi ghi vào SVG, tránh các số thập phân dài do tính sin, cos. */
export const n2 = (v: number): number => Math.round(v * 100) / 100;

/** Viền sáng quanh chữ để đọc được trên mọi nền. */
export const HALO = 'paint-order:stroke;stroke:var(--surface);stroke-width:3px;stroke-linejoin:round;';

const MONO = 'JetBrains Mono,monospace';

/** Kích thước nằm ngang. y là cao độ của đường kích thước, chữ nằm phía trên đường. */
export function hdim(x0: number, x1: number, y: number, txt: string, col: string, dashed = false): string {
  const dash = dashed ? ';stroke-dasharray:3 3' : '';
  return (
    `<g style="stroke:${col};fill:none;stroke-width:1${dash}"><path d="M${n2(x0)} ${n2(y)}H${n2(x1)}M${n2(x0)} ${n2(y - 4)}V${n2(y + 4)}M${n2(x1)} ${n2(y - 4)}V${n2(y + 4)}"/></g>` +
    `<text x="${n2((x0 + x1) / 2)}" y="${n2(y - 5)}" text-anchor="middle" font-size="10" font-family="${MONO}" style="${HALO}fill:${col}">${escapeHtml(txt)}</text>`
  );
}

/** Kích thước thẳng đứng. side là -1 (chữ bên trái) hoặc 1 (chữ bên phải). */
export function vdim(y0: number, y1: number, x: number, txt: string, col: string, side: -1 | 1, dashed = false): string {
  const tx = x + side * 9;
  const dash = dashed ? ';stroke-dasharray:3 3' : '';
  return (
    `<g style="stroke:${col};fill:none;stroke-width:1${dash}"><path d="M${n2(x)} ${n2(y0)}V${n2(y1)}M${n2(x - 4)} ${n2(y0)}H${n2(x + 4)}M${n2(x - 4)} ${n2(y1)}H${n2(x + 4)}"/></g>` +
    `<text transform="translate(${n2(tx)} ${n2((y0 + y1) / 2)}) rotate(${side < 0 ? -90 : 90})" text-anchor="middle" font-size="10" font-family="${MONO}" style="${HALO}fill:${col}">${escapeHtml(txt)}</text>`
  );
}

/** Chữ vừa trong chiều dài len (đơn vị cm trên bản vẽ) hay không. Ước lượng 5,3 cm mỗi ký tự ở cỡ chữ 9. */
export function fitText(text: string, len: number): boolean {
  return text.length * 5.3 <= len - 6;
}

export interface Label {
  t: string;
  /** true: viết dọc theo cạnh dài. */
  rot: boolean;
}

/**
 * Nhãn trên món: tên đầy đủ nếu vừa; không vừa thì xoay dọc theo cạnh dài;
 * rồi đến tên ngắn khai báo trong dữ liệu. Không món nào vừa thì không ghi.
 */
export function pickLabel(name: string, short: string | undefined, w: number, h: number): Label | null {
  // tên và tên ngắn đều theo ngôn ngữ đang chọn
  const full = tn(name);
  const tries = [full, short ? tn(short) : full.split(' ')[0]!];
  for (const text of tries) {
    if (h >= 16 && fitText(text, w)) return { t: text, rot: false };
    if (w < h && w >= 14 && fitText(text, h)) return { t: text, rot: true };
  }
  return null;
}

/** Góc (độ) để chữ nằm dọc theo một cạnh mà vẫn đọc xuôi, không bị lộn ngược: đưa về khoảng (-90, 90]. */
export function uprightAngle(deg: number): number {
  let d = ((deg % 360) + 360) % 360;
  if (d > 90 && d <= 270) d -= 180;
  else if (d > 270) d -= 360;
  return d;
}

/** Cỡ chữ lớn nhất của nhãn trên cạnh (đơn vị bản vẽ, cm), cùng cỡ với các đường kích thước khác. */
export const EDGE_FONT_MAX = 10;
/** Nhãn (chữ cộng đệm hai bên) chiếm tối đa bấy nhiêu phần độ dài cạnh, để luôn ngắn hơn cạnh và còn chừa lề. */
const EDGE_FILL = 0.85;
/** Chữ đơn cách (JetBrains Mono) rộng 0,6 lần cỡ chữ; đệm mỗi bên 0,4 lần cỡ chữ; viên nhãn cao 1,5 lần cỡ chữ. */
const GLYPH = 0.6;
const PAD = 0.4;

/**
 * Cỡ chữ để một nhãn gồm `chars` ký tự nằm lọt trong cạnh dài `len` (cm): lớn nhất có thể nhưng không quá EDGE_FONT_MAX,
 * và cả viên nhãn (chữ cộng đệm) không bao giờ vượt EDGE_FILL độ dài cạnh. Cạnh càng ngắn chữ càng nhỏ, nên nhãn luôn nhỏ hơn cạnh.
 */
export function edgeFontSize(len: number, chars: number): number {
  const n = Math.max(1, chars);
  const fit = (EDGE_FILL * Math.max(0, len)) / (GLYPH * n + 2 * PAD);
  return Math.max(0.5, Math.min(EDGE_FONT_MAX, fit));
}

/**
 * Nhãn kích thước nằm ngay trên một cạnh của món: chỉ có số, viên thuốc mờ một chút, tâm đặt đúng giữa cạnh (x, y),
 * chạy dọc theo cạnh (angle là hướng của cạnh, độ). len là độ dài cạnh (cm): chữ tự co để nhãn luôn ngắn hơn cạnh.
 * kind ("w", "d", "h") để phân biệt các nhãn. Không bắt chuột, nên kéo món vẫn trúng món.
 */
export function edgeTag(x: number, y: number, angle: number, text: string, kind: string, len: number): string {
  const fs = edgeFontSize(len, text.length);
  const tw = GLYPH * fs * text.length;
  const w = tw + 2 * PAD * fs;
  const h = 1.5 * fs;
  return (
    `<g class="edgetag" data-kind="${kind}" transform="translate(${n2(x)} ${n2(y)}) rotate(${n2(uprightAngle(angle))})" style="opacity:.88;pointer-events:none">` +
    `<rect x="${n2(-w / 2)}" y="${n2(-h / 2)}" width="${n2(w)}" height="${n2(h)}" rx="${n2(fs * 0.4)}" style="fill:var(--surface);fill-opacity:.72;stroke:var(--accent);stroke-opacity:.55;stroke-width:${n2(Math.min(0.8, fs * 0.08))}"/>` +
    `<text y="${n2(fs * 0.34)}" text-anchor="middle" font-size="${n2(fs)}" font-weight="600" font-family="${MONO}" textLength="${n2(tw)}" lengthAdjust="spacingAndGlyphs" style="fill:var(--accent)">${escapeHtml(text)}</text>` +
    `</g>`
  );
}

/** Tên đọc cho cửa đi hoặc cửa sổ (dùng làm aria-label): loại, tường và chiều rộng. */
export function openingLabel(kind: OpeningKind, d: { wall: WallKey; w: number }): string {
  const p = { wall: tn(WALL_NAMES[d.wall]).toLowerCase(), w: fm(d.w) };
  return kind === 'door' ? t('Cửa đi, {wall}, rộng {w} cm', p) : t('Cửa sổ, {wall}, rộng {w} cm', p);
}

/** Mở nhóm SVG của một cửa đi hoặc cửa sổ: chọn được, kéo được. Đóng bằng </g>. */
export function openingOpen(kind: OpeningKind, uid: number, label: string): string {
  return `<g class="op" data-kind="${kind}" data-uid="${uid}" tabindex="0" role="button" aria-label="${escapeHtml(label)}" style="cursor:move">`;
}

/** Ổ khóa nhỏ đặt ở (cx, cy), giữ thẳng đứng dù món xoay. */
export function lockGlyph(cx: number, cy: number, rotDeg: number): string {
  return (
    `<g transform="translate(${n2(cx)} ${n2(cy)}) rotate(${n2(-rotDeg)})" style="pointer-events:none" class="lock">` +
    `<path d="M-2.8 -0.5V-2.6a2.8 2.8 0 0 1 5.6 0V-0.5" style="fill:none;stroke:var(--surface);stroke-width:3.6;stroke-linecap:round"/>` +
    `<rect x="-4.6" y="-1" width="9.2" height="7" rx="1.4" style="fill:var(--surface);stroke:var(--surface);stroke-width:2"/>` +
    `<path d="M-2.8 -0.5V-2.6a2.8 2.8 0 0 1 5.6 0V-0.5" style="fill:none;stroke:var(--ink);stroke-width:1.5;stroke-linecap:round"/>` +
    `<rect x="-4.6" y="-1" width="9.2" height="7" rx="1.4" style="fill:var(--ink)"/>` +
    `</g>`
  );
}

/** Lưới 50 cm mờ phía sau bản vẽ. fromBottom: đếm các đường ngang từ đáy lên (mặt đứng tính độ cao từ sàn). */
export function gridLines(w: number, h: number, fromBottom = false, step = 50): string {
  const o: string[] = [];
  for (let x = step; x < w; x += step) o.push(`<path d="M${x} 0V${h}" style="stroke:#000;stroke-opacity:.07;stroke-width:.6"/>`);
  for (let y = step; y < h; y += step) {
    const yy = fromBottom ? h - y : y;
    o.push(`<path d="M0 ${yy}H${w}" style="stroke:#000;stroke-opacity:.07;stroke-width:.6"/>`);
  }
  return o.join('');
}
