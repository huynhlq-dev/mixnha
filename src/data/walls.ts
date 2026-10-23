import type { WallKey } from './schema';

export const WALL_KEYS: readonly WallKey[] = ['T', 'R', 'B', 'L'];

export const WALL_NAMES: Readonly<Record<WallKey, string>> = {
  T: 'Tường trên',
  R: 'Tường phải',
  B: 'Tường dưới',
  L: 'Tường trái',
};

export const isWallKey = (v: unknown): v is WallKey => typeof v === 'string' && (WALL_KEYS as readonly string[]).includes(v);
