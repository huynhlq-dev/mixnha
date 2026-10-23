import { describe, expect, it } from 'vitest';
import { LIMITS } from '../src/core/limits';
import { registry } from '../src/core/registry';
import { buildProject, countOf, countsError, DEFAULT_COUNTS, projectRooms, totalArea, totalRooms } from '../src/core/project';
import { isRoomIdString } from '../src/core/rooms';
import { DEFAULT_ROOMS, ROOM_TYPE_IDS, ROOMS } from '../src/data/rooms';

let uid = 1;
const nextUid = () => uid++;

describe('chọn số phòng khi tạo dự án', () => {
  it('countOf đọc số nguyên không âm; giá trị lạ là 0', () => {
    expect(countOf({ ngu: 2 }, 'ngu')).toBe(2);
    expect(countOf({ ngu: 2.9 }, 'ngu')).toBe(2);
    expect(countOf({}, 'ngu')).toBe(0);
    expect(countOf({ ngu: -3 }, 'ngu')).toBe(0);
    expect(countOf({ ngu: Number.NaN }, 'ngu')).toBe(0);
    expect(countOf({ ngu: '2' as unknown as number }, 'ngu')).toBe(0);
  });

  it('tổng số phòng và tổng diện tích theo cỡ mặc định của từng loại', () => {
    expect(totalRooms(DEFAULT_COUNTS)).toBe(4);
    expect(totalRooms({ ngu: 2, wc: 1 })).toBe(3);
    expect(totalArea({ ngu: 2 })).toBeCloseTo((2 * ROOMS.ngu.W * ROOMS.ngu.H) / 10000, 6);
    expect(totalArea(DEFAULT_COUNTS)).toBeCloseTo(48.4, 1);
    expect(totalArea({})).toBe(0);
  });

  it('countsError: cần từ 1 đến LIMITS.maxRooms phòng', () => {
    expect(countsError({})).toContain('ít nhất một phòng');
    expect(countsError({ ngu: 0, khach: 0 })).not.toBeNull();
    expect(countsError({ ngu: 1 })).toBeNull();
    expect(countsError({ ngu: LIMITS.maxRooms })).toBeNull();
    expect(countsError({ ngu: LIMITS.maxRooms, khach: 1 })).toContain(String(LIMITS.maxRooms));
  });

  it('căn hộ mặc định của trình tạo giống căn hộ mặc định của trang', () => {
    expect(projectRooms(DEFAULT_COUNTS)).toEqual(DEFAULT_ROOMS);
  });
});

describe('danh sách phòng của dự án', () => {
  it('theo thứ tự loại phòng trong thư viện, không theo thứ tự ghi trong counts', () => {
    const rooms = projectRooms({ trong: 1, lamviec: 1, wc: 1, bep: 1, khach: 1, ngu: 1 });
    expect(rooms.map((r) => r.type)).toEqual([...ROOM_TYPE_IDS]);
  });

  it('cùng loại thì đánh số mã và tên: ngu, ngu2, ngu3 và Phòng ngủ, Phòng ngủ 2, Phòng ngủ 3', () => {
    const rooms = projectRooms({ ngu: 3, khach: 1 });
    expect(rooms.map((r) => r.id)).toEqual(['ngu', 'ngu2', 'ngu3', 'khach']);
    expect(rooms.map((r) => r.name)).toEqual(['Phòng ngủ', 'Phòng ngủ 2', 'Phòng ngủ 3', 'Phòng khách']);
  });

  it('mã luôn hợp lệ và không trùng, kể cả khi đủ 12 phòng', () => {
    const rooms = projectRooms({ ngu: 4, khach: 3, bep: 2, wc: 2, trong: 1 });
    expect(rooms).toHaveLength(12);
    expect(new Set(rooms.map((r) => r.id)).size).toBe(12);
    for (const r of rooms) expect(isRoomIdString(r.id)).toBe(true);
  });

  it('quá giới hạn thì cắt bớt từ cuối', () => {
    const rooms = projectRooms({ ngu: 10, khach: 10 });
    expect(rooms).toHaveLength(LIMITS.maxRooms);
    expect(rooms.filter((r) => r.type === 'khach')).toHaveLength(2);
  });
});

describe('dựng dự án mới', () => {
  it('mỗi phòng có bản vẽ đúng cỡ của loại, có cửa đi', () => {
    const { rooms, layouts } = buildProject({ counts: { ngu: 2, wc: 1 }, sample: false }, registry, nextUid);
    expect(Object.keys(layouts).sort()).toEqual(rooms.map((r) => r.id).sort());
    for (const r of rooms) {
      const l = layouts[r.id]!;
      expect(l.W).toBe(ROOMS[r.type].W);
      expect(l.H).toBe(ROOMS[r.type].H);
      expect(l.doors.length).toBeGreaterThan(0);
    }
  });

  it('không kèm đồ mẫu thì phòng để trống (chỉ có cửa); kèm đồ mẫu thì có đồ như bố trí mẫu của loại', () => {
    const empty = buildProject({ counts: { ngu: 1, khach: 1 }, sample: false }, registry, nextUid);
    for (const l of Object.values(empty.layouts)) {
      expect(l.items).toEqual([]);
      expect(l.walls.T.length + l.walls.R.length + l.walls.B.length + l.walls.L.length).toBe(0);
    }
    const sample = buildProject({ counts: { ngu: 1, khach: 1 }, sample: true }, registry, nextUid);
    expect(sample.layouts.ngu!.items.length).toBeGreaterThan(0);
    expect(sample.layouts.khach!.items.length).toBeGreaterThan(0);
  });

  it('hai phòng cùng loại có bản vẽ riêng (không chung mảng), uid không trùng giữa mọi phòng', () => {
    const { layouts } = buildProject({ counts: { ngu: 2 }, sample: true }, registry, nextUid);
    expect(layouts.ngu).not.toBe(layouts.ngu2);
    expect(layouts.ngu!.items).not.toBe(layouts.ngu2!.items);
    const uids = Object.values(layouts).flatMap((l) => [...l.items, ...l.walls.T, ...l.walls.R, ...l.walls.B, ...l.walls.L, ...l.doors, ...l.windows].map((x) => x.uid));
    expect(new Set(uids).size).toBe(uids.length);
  });

  it('chưa chọn phòng nào thì dùng căn hộ mặc định bốn phòng', () => {
    const { rooms } = buildProject({ counts: {}, sample: false }, registry, nextUid);
    expect(rooms).toEqual(DEFAULT_ROOMS);
  });

  it('phòng làm việc và phòng trống dựng được', () => {
    const { layouts } = buildProject({ counts: { lamviec: 1, trong: 1 }, sample: true }, registry, nextUid);
    expect(layouts.lamviec!.items.length).toBeGreaterThan(0);
    expect(layouts.trong!.items).toEqual([]);
  });
});
