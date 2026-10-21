import type { DoorDef, RoomDef, WallKey, WindowDef } from '../data/schema';
import { openRange, wallLength, type RoomSize } from './geometry';
import type { Layout } from './types';

export interface DoorFit extends DoorDef {}
export interface WindowFit extends WindowDef {
  sill: number;
  h: number;
}

/** Kích thước phòng hiện tại (cm), cửa và cửa sổ đã chỉnh cho vừa tường. */
export interface RoomGeo extends RoomSize {
  id: string;
  name: string;
  ceil: number;
  doors: DoorFit[];
  windows: WindowFit[];
  guides: { y: number; label: string }[];
}

/** Một chỗ mở trên tường nhìn ở mặt đứng. */
export interface Opening {
  kind: 'door' | 'win';
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export const DOOR_HEIGHT = 205;

function fit<T extends DoorDef>(d: T, W: number, H: number): T {
  const len = d.wall === 'T' || d.wall === 'B' ? W : H;
  const w = Math.max(30, Math.min(d.w, len - 10));
  const pos = Math.max(5, Math.min(d.pos, len - w - 5));
  return { ...d, w, pos };
}

export function roomGeo(def: RoomDef, layout: Layout): RoomGeo {
  const { W, H } = layout;
  return {
    id: def.id,
    name: def.name,
    W,
    H,
    ceil: layout.ceil,
    doors: def.doors.map((d) => fit(d, W, H)),
    windows: def.windows.map((d) => {
      const f = fit(d, W, H);
      return { ...f, sill: f.sill ?? 90, h: f.h ?? 120 };
    }),
    guides: def.guides ?? [],
  };
}

/** Cửa đi và cửa sổ trên một bức tường, theo hệ tọa độ của mặt đứng. */
export function openingsOn(R: RoomGeo, wall: WallKey): Opening[] {
  const out: Opening[] = [];
  for (const d of R.doors) {
    if (d.wall !== wall) continue;
    const [x0, x1] = openRange(R, d);
    out.push({ kind: 'door', x0, x1, y0: 0, y1: DOOR_HEIGHT });
  }
  for (const d of R.windows) {
    if (d.wall !== wall) continue;
    const [x0, x1] = openRange(R, d);
    out.push({ kind: 'win', x0, x1, y0: d.sill, y1: d.sill + d.h });
  }
  return out;
}

export { wallLength };
