import type { CategoryDef, ItemDef, RoomDef } from '../data/schema';
import { FLOOR_COLORS } from '../data/palettes';
import { WALL_KEYS } from '../data/walls';
import { LIMITS } from './limits';

export interface Issue {
  level: 'error' | 'warn';
  /** Mã món hoặc mã phòng liên quan. */
  where: string;
  field?: string;
  message: string;
}

const ID_PATTERN = /^[a-z][A-Za-z0-9]*(-[A-Za-z0-9]+)*$/;
const HEX6 = /^#[0-9a-fA-F]{6}$/;
const MAX_SHORT = 10;
const MAX_RETIRE_HOPS = 8;

/** Độ dày hoặc độ nhô ra nhỏ nhất cho phép (tranh, gương mỏng). */
const MIN_THIN = 1;

/**
 * Kiểm tra dữ liệu khai báo đồ, nhóm và phòng. Hàm thuần, dùng cho lệnh validate:items và cho test.
 * Lỗi (error) thì không nên đưa lên. Cảnh báo (warn) là điều nên xem lại.
 */
export function validateData(items: readonly ItemDef[], categories: readonly CategoryDef[], rooms: readonly RoomDef[], shapeIds: readonly string[]): Issue[] {
  const out: Issue[] = [];
  const err = (where: string, message: string, field?: string) => out.push({ level: 'error', where, field, message });
  const warn = (where: string, message: string, field?: string) => out.push({ level: 'warn', where, field, message });

  const catById = new Map<string, CategoryDef>();
  for (const c of categories) {
    if (catById.has(c.id)) err(c.id, 'Mã nhóm bị trùng', 'id');
    catById.set(c.id, c);
    if (!c.name.trim()) err(c.id, 'Nhóm thiếu tên', 'name');
  }

  const byId = new Map<string, ItemDef>();
  for (const it of items) {
    if (byId.has(it.id)) err(it.id, 'Mã món bị trùng', 'id');
    else byId.set(it.id, it);
  }

  for (const it of items) {
    if (!ID_PATTERN.test(it.id)) err(it.id, 'Mã món phải bắt đầu bằng chữ thường, chỉ gồm chữ, số và gạch ngang', 'id');
    if (!it.name.trim()) err(it.id, 'Thiếu tên', 'name');
    if (it.short !== undefined && (it.short.length === 0 || it.short.length > MAX_SHORT)) err(it.id, `Tên ngắn phải từ 1 đến ${MAX_SHORT} ký tự`, 'short');
    if (!HEX6.test(it.color)) err(it.id, `Màu "${it.color}" không phải mã hex 6 ký tự (ví dụ #8FB4D9)`, 'color');
    if (it.shape !== undefined && !shapeIds.includes(it.shape)) err(it.id, `Kiểu vẽ "${it.shape}" chưa có. Các kiểu hiện có: ${shapeIds.join(', ')}`, 'shape');

    const cat = catById.get(it.cat);
    if (!cat) err(it.id, `Nhóm "${it.cat}" không có trong categories`, 'cat');
    else if (cat.place !== it.place) err(it.id, `Món đặt "${it.place}" nhưng nhóm "${it.cat}" dành cho "${cat.place}"`, 'place');

    const range = (field: 'w' | 'd' | 'h', lo: number) => {
      const v = it[field];
      if (!Number.isFinite(v) || v < lo || v > LIMITS.itemSize.max) err(it.id, `${field} = ${v} nằm ngoài khoảng ${lo}–${LIMITS.itemSize.max} cm`, field);
    };
    const { min } = LIMITS.itemSize;
    if (it.place === 'floor') {
      range('w', min);
      range('d', min);
      range('h', MIN_THIN);
      if (it.y !== undefined) warn(it.id, 'Đồ đặt sàn không dùng trường y', 'y');
    } else {
      range('w', min);
      range('h', min);
      range('d', MIN_THIN);
      if (it.y === undefined) err(it.id, 'Đồ gắn tường cần trường y (độ cao mép dưới)', 'y');
      else if (!(it.y >= LIMITS.itemY.min && it.y <= LIMITS.itemY.max)) err(it.id, `y = ${it.y} nằm ngoài khoảng ${LIMITS.itemY.min}–${LIMITS.itemY.max} cm`, 'y');
      else if (it.y + it.h > 450) err(it.id, 'Món cao quá, vượt trần cao nhất cho phép (450 cm)', 'h');
      if (it.layer) warn(it.id, 'Đồ gắn tường không dùng trường layer', 'layer');
      if (it.ignoreLane) warn(it.id, 'Đồ gắn tường không dùng trường ignoreLane', 'ignoreLane');
    }

    if (!['draft', 'live', 'retired'].includes(it.status)) err(it.id, `status "${it.status}" không hợp lệ`, 'status');
    if (it.status === 'retired') {
      if (!it.replacedBy) err(it.id, 'Món retired cần replacedBy trỏ tới món thay thế', 'replacedBy');
      else {
        let cur: ItemDef | undefined = byId.get(it.replacedBy);
        for (let i = 0; cur && cur.status === 'retired' && i < MAX_RETIRE_HOPS; i++) cur = cur.replacedBy ? byId.get(cur.replacedBy) : undefined;
        if (!cur) err(it.id, `replacedBy "${it.replacedBy}" không có trong dữ liệu`, 'replacedBy');
        else if (cur.status === 'retired') err(it.id, 'replacedBy dẫn vào vòng lặp hoặc chuỗi quá dài', 'replacedBy');
        else if (cur.place !== it.place) err(it.id, `Món thay thế "${cur.id}" khác loại đặt (${cur.place})`, 'replacedBy');
      }
    } else if (it.replacedBy) {
      warn(it.id, 'replacedBy chỉ có ý nghĩa với món retired', 'replacedBy');
    }
  }

  for (const r of rooms) {
    if (!FLOOR_COLORS[r.floor]) err(r.id, `floor = ${r.floor} không có trong FLOOR_COLORS`, 'floor');
    const lenOf = (w: string) => (w === 'T' || w === 'B' ? r.W : r.H);
    for (const d of [...r.doors, ...r.windows]) {
      if (d.pos < 0 || d.pos + d.w > lenOf(d.wall)) err(r.id, `Cửa hoặc cửa sổ trên tường ${d.wall} vượt quá chiều dài tường`, 'doors');
    }
    for (const [id, x, y] of r.sample.floor) {
      const def = byId.get(id);
      if (!def) err(r.id, `Bố trí mẫu dùng món "${id}" không có trong dữ liệu`, 'sample');
      else if (def.place !== 'floor') err(r.id, `Bố trí mẫu đặt "${id}" lên sàn nhưng món này gắn tường`, 'sample');
      else if (def.status !== 'live') err(r.id, `Bố trí mẫu dùng món "${id}" chưa live (${def.status})`, 'sample');
      if (x < 0 || x > r.W || y < 0 || y > r.H) warn(r.id, `Món "${id}" trong bố trí mẫu nằm ngoài phòng`, 'sample');
    }
    for (const wk of WALL_KEYS) {
      for (const [id, s] of r.sample.walls[wk] ?? []) {
        const def = byId.get(id);
        if (!def) err(r.id, `Bố trí mẫu tường ${wk} dùng món "${id}" không có trong dữ liệu`, 'sample');
        else if (def.place !== 'wall') err(r.id, `Bố trí mẫu đặt "${id}" lên tường nhưng món này đặt sàn`, 'sample');
        else if (def.status !== 'live') err(r.id, `Bố trí mẫu dùng món "${id}" chưa live (${def.status})`, 'sample');
        if (s < 0 || s > lenOf(wk)) warn(r.id, `Món "${id}" trên tường ${wk} nằm ngoài tường`, 'sample');
      }
    }
  }
  return out;
}
