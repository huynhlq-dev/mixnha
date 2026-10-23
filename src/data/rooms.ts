import type { RoomDef } from './schema';

/**
 * Các LOẠI phòng trong thư viện (nhóm "Phòng"). Thứ tự ở đây là thứ tự trong thư viện.
 * Thêm loại mới: thêm mã vào đây và một mục trong ROOMS, rồi chạy npm run validate:items.
 */
export const ROOM_TYPE_IDS = ['ngu', 'khach', 'bep', 'wc', 'lamviec', 'trong'] as const;
export type RoomTypeId = (typeof ROOM_TYPE_IDS)[number];

/** Mã của căn hộ mặc định (bốn phòng đầu); mã mặc định cũng là mã loại phòng. */
export const ROOM_IDS = ['ngu', 'khach', 'bep', 'wc'] as const;

/** Mã một phòng trong căn hộ: chuỗi do app đặt (loại phòng, thêm số nếu trùng: ngu, ngu2...). Xem core/rooms.ts. */
export type RoomId = string;

/** Một phòng của căn hộ: mã, loại (quyết định cỡ, cửa, bố trí mẫu ban đầu) và tên hiện trên tab, mô hình. */
export interface RoomEntry {
  id: RoomId;
  type: RoomTypeId;
  name: string;
}

export const ROOMS: Readonly<Record<RoomTypeId, RoomDef>> = {
  ngu: {
    id: 'ngu',
    name: 'Phòng ngủ',
    W: 400,
    H: 350,
    ceil: 270,
    floor: 0,
    doors: [{ wall: 'B', pos: 30, w: 80 }],
    windows: [{ wall: 'T', pos: 110, w: 180 }],
    sample: {
      floor: [
        ['bed2', 200, 115, 0],
        ['night', 85, 40, 0],
        ['night', 315, 40, 0],
        ['ward4', 290, 318, 180],
        ['dress', 370, 150, 270],
      ],
      walls: { L: [['ac', 175, 220]], R: [['mirror', 150, 110]] },
    },
  },
  khach: {
    id: 'khach',
    name: 'Phòng khách',
    W: 520,
    H: 380,
    ceil: 270,
    floor: 0,
    doors: [{ wall: 'B', pos: 40, w: 90 }],
    windows: [{ wall: 'R', pos: 60, w: 180 }],
    sample: {
      floor: [
        ['rug', 240, 200, 0],
        ['sofa3', 240, 325, 180],
        ['coffee', 240, 220, 0],
        ['tv', 240, 25, 0],
        ['arm', 470, 230, 270],
        ['shoe', 465, 350, 0],
      ],
      walls: {
        T: [
          ['tvw', 240, 95],
          ['art', 110, 130],
          ['art', 370, 130],
        ],
        B: [['art', 280, 120]],
      },
    },
  },
  bep: {
    id: 'bep',
    name: 'Bếp và ăn',
    W: 320,
    H: 320,
    ceil: 270,
    floor: 1,
    doors: [{ wall: 'L', pos: 150, w: 80 }],
    windows: [{ wall: 'R', pos: 100, w: 100 }],
    guides: [{ y: 85, label: 'mặt bếp 85' }],
    sample: {
      floor: [
        ['cook', 135, 30, 0],
        ['fridge', 265, 35, 0],
        ['dine4', 170, 215, 0],
        ['chair', 140, 145, 0],
        ['chair', 200, 145, 0],
        ['chair', 140, 285, 0],
        ['chair', 200, 285, 0],
      ],
      walls: {
        T: [
          ['cabU60', 75, 145],
          ['cabU60', 135, 145],
          ['hood', 195, 150],
          ['micro', 75, 85],
        ],
      },
    },
  },
  wc: {
    id: 'wc',
    name: 'Nhà vệ sinh',
    W: 200,
    H: 220,
    ceil: 270,
    floor: 2,
    doors: [{ wall: 'B', pos: 20, w: 70 }],
    windows: [{ wall: 'R', pos: 70, w: 50, sill: 150, h: 50 }],
    sample: {
      floor: [
        ['shower', 45, 45, 0],
        ['basin', 155, 25, 0],
        ['toilet', 155, 185, 0],
      ],
      walls: { T: [['mirror', 155, 130]] },
    },
  },
  lamviec: {
    id: 'lamviec',
    name: 'Phòng làm việc',
    W: 300,
    H: 280,
    ceil: 270,
    floor: 1,
    doors: [{ wall: 'B', pos: 30, w: 80 }],
    windows: [{ wall: 'T', pos: 80, w: 140 }],
    sample: {
      floor: [
        ['desk', 150, 35, 0],
        ['swivel', 150, 100, 0],
        ['shelf', 284, 150, 270],
      ],
      walls: {},
    },
  },
  trong: {
    id: 'trong',
    name: 'Phòng trống',
    W: 300,
    H: 300,
    ceil: 270,
    floor: 0,
    doors: [{ wall: 'B', pos: 110, w: 80 }],
    windows: [],
    sample: { floor: [], walls: {} },
  },
};

/** Căn hộ lúc mới mở lần đầu: bốn phòng mặc định, theo thứ tự tab. */
export const DEFAULT_ROOMS: readonly RoomEntry[] = ROOM_IDS.map((id) => ({ id, type: id, name: ROOMS[id].name }));
