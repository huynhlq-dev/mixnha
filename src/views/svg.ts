import { escapeHtml } from '../core/format';

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
export function fitText(t: string, len: number): boolean {
  return t.length * 5.3 <= len - 6;
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
  const tries = [name, short || name.split(' ')[0]!];
  for (const t of tries) {
    if (h >= 16 && fitText(t, w)) return { t, rot: false };
    if (w < h && w >= 14 && fitText(t, h)) return { t, rot: true };
  }
  return null;
}

/** Ổ khóa nhỏ đặt ở (cx, cy), giữ thẳng đứng dù món xoay. */
export function lockGlyph(cx: number, cy: number, rotDeg: number): string {
  return (
    `<g transform="translate(${n2(cx)} ${n2(cy)}) rotate(${n2(-rotDeg)})" style="pointer-events:none" class="lock">` +
    `<path d="M-2.8 -0.5V-2.6a2.8 2.8 0 0 1 5.6 0V-0.5" style="fill:none;stroke:var(--surface);stroke-width:3.6;stroke-linecap:round"/>` +
    `<rect x="-4.6" y="-1" width="9.2" height="7" rx="1.4" style="fill:var(--surface);stroke:var(--surface);stroke-width:2"/>` +
    `<path d="M-2.8 -0.5V-2.6a2.8 2.8 0 0 1 5.6 0V-0.5" style="fill:none;stroke:#15211E;stroke-width:1.5;stroke-linecap:round"/>` +
    `<rect x="-4.6" y="-1" width="9.2" height="7" rx="1.4" style="fill:#15211E"/>` +
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
