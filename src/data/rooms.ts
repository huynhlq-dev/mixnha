import type { RoomDef } from './schema';

/** Thứ tự ở đây là thứ tự tab phòng. Thêm phòng mới: thêm id vào đây và một mục trong ROOMS. */
export const ROOM_IDS = ['ngu', 'khach', 'bep', 'wc'] as const;
export type RoomId = (typeof ROOM_IDS)[number];

export const ROOMS: Readonly<Record<RoomId, RoomDef>> = {
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
};
