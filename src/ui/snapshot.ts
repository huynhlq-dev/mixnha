import { dateStamp, slugify } from '../storage/file';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Các thuộc tính trình bày của SVG được ghi cứng vào từng phần tử: ảnh SVG đứng riêng không đọc được biến CSS (var(--...)) và bảng kiểu của trang. */
const STYLE_PROPS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'letter-spacing',
  'text-anchor',
  'dominant-baseline',
  'paint-order',
  'display',
  'visibility',
] as const;

/** Tên file ảnh: các phần (tên dự án, phòng, kiểu xem) bỏ dấu, nối bằng gạch nối, rồi ngày: can-ho-mau-phong-ngu-mat-bang-20261028.png */
export function imageFilename(parts: readonly (string | undefined)[], now: Date): string {
  const slug = parts
    .map((p) => slugify(p))
    .filter(Boolean)
    .join('-');
  return `${slug || 'ban-thiet-ke'}-${dateStamp(now)}.png`;
}

/** Chép kiểu đã tính của từng phần tử trong src sang phần tử tương ứng của bản sao dst (hai cây giống hệt nhau, cùng thứ tự). */
export function inlineStyles(src: Element, dst: Element): void {
  const from = [src, ...src.querySelectorAll('*')];
  const to = [dst, ...dst.querySelectorAll('*')];
  for (let i = 0; i < from.length; i++) {
    const cs = getComputedStyle(from[i]!);
    const style = (to[i] as SVGElement | undefined)?.style;
    if (!style) continue;
    for (const p of STYLE_PROPS) {
      const v = cs.getPropertyValue(p);
      if (v) style.setProperty(p, v);
    }
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Không đọc được ảnh SVG.'));
    img.src = url;
  });
}

/** Giao diện đọc sách (không màu): ảnh chụp cũng không màu, đúng như đang thấy. */
const isMono = (): boolean => document.documentElement.dataset.theme === 'mono';

function blobOf(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được ảnh PNG.'))), 'image/png'));
}

/** Canvas (khung 3D) thành file PNG. Gọi ngay sau khi vẽ: bộ đệm WebGL bị xóa sau khi hiện lên màn hình. */
export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  if (!isMono()) return blobOf(canvas);
  const gray = document.createElement('canvas');
  gray.width = canvas.width;
  gray.height = canvas.height;
  const ctx = gray.getContext('2d');
  if (!ctx) return blobOf(canvas);
  ctx.filter = 'grayscale(1)';
  ctx.drawImage(canvas, 0, 0);
  return blobOf(gray);
}

/**
 * Bản vẽ SVG đang hiện (mặt bằng, mặt đứng) thành ảnh PNG đúng như trên màn hình, nét gấp đôi cho rõ. Nền lấy theo nền của khung vẽ.
 */
export async function svgToPng(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  const box = svg.getBoundingClientRect();
  const w = Math.max(1, Math.round(box.width));
  const h = Math.max(1, Math.round(box.height));
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, clone);
  clone.removeAttribute('style');
  clone.removeAttribute('class');
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Không tạo được ảnh PNG.');
    if (isMono()) ctx.filter = 'grayscale(1)';
    const bg = getComputedStyle(svg).backgroundColor;
    ctx.fillStyle = bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await blobOf(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}
