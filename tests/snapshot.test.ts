import { describe, expect, it } from 'vitest';
import { imageFilename } from '../src/ui/snapshot';

const NOW = new Date(2026, 9, 28, 9, 30);

describe('tên file ảnh chụp', () => {
  it('ghép tên dự án, phòng, kiểu xem (bỏ dấu, gạch nối) rồi ngày', () => {
    expect(imageFilename(['Nhà Bà Tư', 'Phòng ngủ', 'mat-bang'], NOW)).toBe('nha-ba-tu-phong-ngu-mat-bang-20261028.png');
  });

  it('bỏ phần rỗng; không còn gì thì dùng tên mặc định', () => {
    expect(imageFilename(['', 'Bếp và ăn', undefined, '3d'], NOW)).toBe('bep-va-an-3d-20261028.png');
    expect(imageFilename(['', undefined], NOW)).toBe('ban-thiet-ke-20261028.png');
  });

  it('ký tự lạ trong tên không lọt vào tên file', () => {
    expect(imageFilename(['a/b\\c:d*e?"<>|', 'x'], NOW)).toBe('a-b-c-d-e-x-20261028.png');
  });
});
