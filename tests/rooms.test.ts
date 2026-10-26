import { describe, expect, it } from 'vitest';
import { freshLayout } from '../src/core/layout';
import { registry } from '../src/core/registry';
import { isRoomIdString, isRoomTypeId, MAX_ROOM_NAME, newRoomEntry, roomDef, roomDragId, roomTypeFromDragId } from '../src/core/rooms';
import { DEFAULT_ROOMS, ROOM_IDS, ROOM_TYPE_IDS, ROOMS, type RoomEntry } from '../src/data/rooms';

describe('căn hộ mặc định và các loại phòng', () => {
  it('căn hộ mặc định là bốn phòng đầu, mã trùng mã loại và tên theo loại', () => {
    expect(DEFAULT_ROOMS.map((r) => r.id)).toEqual([...ROOM_IDS]);
    expect(DEFAULT_ROOMS.map((r) => r.id)).toEqual(['ngu', 'khach', 'bep', 'wc']);
    for (const r of DEFAULT_ROOMS) expect(r).toEqual({ id: r.id, type: r.id, name: ROOMS[r.type].name });
  });

  it('mọi loại phòng đều là một khai báo đủ dùng: có cửa đi, có bố cục mẫu dựng được', () => {
    expect(ROOM_TYPE_IDS).toEqual(expect.arrayContaining(['ngu', 'khach', 'bep', 'wc', 'lamviec', 'trong', 'banchong']));
    let uid = 1;
    for (const t of ROOM_TYPE_IDS) {
      expect(ROOMS[t].id).toBe(t);
      // mỗi loại phòng có lối vào: cửa đi, hoặc cửa kính (ban công)
      expect((ROOMS[t].doors?.length ?? 0) + (ROOMS[t].windows?.length ?? 0)).toBeGreaterThan(0);
      const l = freshLayout(ROOMS[t], registry, () => uid++);
      expect(l.W).toBe(ROOMS[t].W);
      expect(l.H).toBe(ROOMS[t].H);
    }
  });

  it('phòng trống chưa có món nào; phòng làm việc có bàn', () => {
    let uid = 1;
    expect(freshLayout(ROOMS.trong, registry, () => uid++).items).toEqual([]);
    expect(freshLayout(ROOMS.lamviec, registry, () => uid++).items.length).toBeGreaterThan(0);
  });
});

describe('mã phòng và loại phòng', () => {
  it('nhận mã chữ thường, số, gạch ngang; từ chối mã lạ', () => {
    for (const ok of ['ngu', 'ngu2', 'phong-con', 'a']) expect(isRoomIdString(ok)).toBe(true);
    for (const bad of ['', 'Ngu', '2ngu', 'ngu 2', '-x', 'a'.repeat(25), '__proto__', 'constructor!', 5, null, undefined]) expect(isRoomIdString(bad)).toBe(false);
    expect(isRoomIdString('a'.repeat(24))).toBe(true);
  });

  it('chỉ loại có trong trang mới là loại phòng', () => {
    expect(isRoomTypeId('ngu')).toBe(true);
    expect(isRoomTypeId('garage')).toBe(false);
    expect(isRoomTypeId('toString')).toBe(false);
    expect(isRoomTypeId(1)).toBe(false);
  });

  it('roomDef lấy cỡ, cửa và mẫu từ loại nhưng mang mã và tên của phòng đó', () => {
    const d = roomDef({ id: 'ngu2', type: 'ngu', name: 'Phòng con' });
    expect(d.id).toBe('ngu2');
    expect(d.name).toBe('Phòng con');
    expect(d.W).toBe(ROOMS.ngu.W);
    expect(d.sample).toBe(ROOMS.ngu.sample);
    expect(ROOMS.ngu.id).toBe('ngu');
  });
});

describe('phòng mới theo loại', () => {
  it('chưa có phòng cùng loại thì lấy mã và tên của loại', () => {
    expect(newRoomEntry('lamviec', DEFAULT_ROOMS)).toEqual({ id: 'lamviec', type: 'lamviec', name: 'Phòng làm việc' });
  });

  it('trùng thì thêm số nhỏ nhất chưa dùng, cả mã lẫn tên', () => {
    const rooms: RoomEntry[] = DEFAULT_ROOMS.map((r) => ({ ...r }));
    const a = newRoomEntry('ngu', rooms);
    expect(a).toEqual({ id: 'ngu2', type: 'ngu', name: 'Phòng ngủ 2' });
    rooms.push(a);
    expect(newRoomEntry('ngu', rooms)).toEqual({ id: 'ngu3', type: 'ngu', name: 'Phòng ngủ 3' });
    // phòng 2 bị xóa thì số 2 được dùng lại
    expect(newRoomEntry('ngu', DEFAULT_ROOMS)).toEqual(a);
  });

  it('tên đã bị đổi trùng với tên của loại thì cũng tránh', () => {
    const rooms: RoomEntry[] = [{ id: 'x1', type: 'bep', name: 'Phòng ngủ' }];
    expect(newRoomEntry('ngu', rooms)).toEqual({ id: 'ngu2', type: 'ngu', name: 'Phòng ngủ 2' });
  });

  it('mã tạo ra luôn hợp lệ và tên không vượt giới hạn', () => {
    const rooms: RoomEntry[] = [];
    for (let i = 0; i < 30; i++) rooms.push(newRoomEntry(ROOM_TYPE_IDS[i % ROOM_TYPE_IDS.length]!, rooms));
    expect(new Set(rooms.map((r) => r.id)).size).toBe(30);
    for (const r of rooms) {
      expect(isRoomIdString(r.id)).toBe(true);
      expect(r.name.length).toBeLessThanOrEqual(MAX_ROOM_NAME);
    }
  });
});

describe('mã kéo thả của loại phòng trong thư viện', () => {
  it('đi và về giữ nguyên loại; mã khác không phải loại phòng', () => {
    for (const t of ROOM_TYPE_IDS) expect(roomTypeFromDragId(roomDragId(t))).toBe(t);
    expect(roomDragId('ngu')).toBe('room:ngu');
    expect(roomTypeFromDragId('bed2')).toBeNull();
    expect(roomTypeFromDragId('room:garage')).toBeNull();
    expect(roomTypeFromDragId('room:')).toBeNull();
    expect(roomTypeFromDragId('')).toBeNull();
  });
});
