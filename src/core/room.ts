import type { OpeningDef, RoomDef, WallKey } from '../data/schema';
import { openRange, wallLength, type RoomSize } from './geometry';
import { LIMITS } from './limits';
import type { DoorItem, Layout, OpeningKind, WindowItem } from './types';

export interface DoorFit extends DoorItem {}
export interface WindowFit extends WindowItem {
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
  kind: OpeningKind;
  uid: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Cửa đi: tay nắm nằm ở bên nào khi đứng trong phòng nhìn ra tường (ngược với bên bản lề). */
  handle?: 'left' | 'right';
}

export const DOOR_HEIGHT = 205;

/** Đưa cửa vào gọn trong tường: rộng tối thiểu, chừa mép ở hai đầu. Dùng khi nhập dữ liệu, đổi cỡ phòng và khi kéo cửa. */
export function fitOpening<T extends OpeningDef>(d: T, W: number, H: number): T {
  const { minW, margin } = LIMITS.opening;
  const len = wallLength({ W, H }, d.wall);
  const w = Math.max(minW, Math.min(d.w, len - 2 * margin));
  const pos = Math.max(margin, Math.min(d.pos, len - w - margin));
  return { ...d, w, pos };
}

/** Cửa đi, cửa sổ lấy từ bản vẽ (người dùng đã dời được); def chỉ cho tên phòng và các vạch tham chiếu. */
export function roomGeo(def: RoomDef, layout: Layout): RoomGeo {
  const { W, H } = layout;
  return {
    id: def.id,
    name: def.name,
    W,
    H,
    ceil: layout.ceil,
    doors: layout.doors.map((d) => fitOpening(d, W, H)),
    windows: layout.windows.map((d) => {
      const f = fitOpening(d, W, H);
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
    // mặt đứng nhìn từ trong phòng: tường trên và phải chạy trái sang phải theo pos, tường dưới và trái thì ngược lại
    const hingeLeft = (d.hinge !== 'end') === (wall === 'T' || wall === 'R');
    out.push({ kind: 'door', uid: d.uid, x0, x1, y0: 0, y1: DOOR_HEIGHT, handle: hingeLeft ? 'right' : 'left' });
  }
  for (const d of R.windows) {
    if (d.wall !== wall) continue;
    const [x0, x1] = openRange(R, d);
    out.push({ kind: 'win', uid: d.uid, x0, x1, y0: d.sill, y1: d.sill + d.h });
  }
  return out;
}

export { wallLength };
