/** Chuẩn hóa mã màu về dạng #rrggbb viết thường. Trả về null nếu không hợp lệ. */
export function normHex(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const [, r, g, b] = s;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Pha màu với màu trắng. t = 0 giữ nguyên, t = 1 là trắng. */
export function hexMix(hex: string, t: number): string {
  const m = (v: number) => Math.round(v + (255 - v) * t);
  return '#' + rgbOf(hex).map((v) => m(v).toString(16).padStart(2, '0')).join('');
}

/** Độ sáng tương đối (0 đen, 1 trắng), dùng để chọn màu chữ dễ đọc trên nền. */
export function luminance(hex: string): number {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = rgbOf(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Màu chữ đọc được trên một màu nền. */
export function textOn(hex: string): string {
  return luminance(hex) > 0.3 ? '#15211E' : '#FFFFFF';
}
