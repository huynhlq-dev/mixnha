/**
 * Kiểm tra dữ liệu đồ trước khi đưa lên:  npm run validate:items
 * Thêm --strict để coi cảnh báo như lỗi (hợp với kiểm tra tự động trước khi build).
 * Lỗi nào cũng báo rõ món nào, trường nào. Chạy xong có mã thoát 1 nếu còn lỗi.
 */
import { validateData } from '../src/core/validate';
import { CATEGORIES } from '../src/data/categories';
import { ALL_ITEMS } from '../src/data/items';
import { ROOM_IDS, ROOMS } from '../src/data/rooms';
import { SHAPE_IDS } from '../src/data/shapes';
import { buildReport, exitCode } from './report';

const strict = process.argv.includes('--strict');
const color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

const issues = validateData(
  ALL_ITEMS,
  CATEGORIES,
  ROOM_IDS.map((id) => ROOMS[id]),
  SHAPE_IDS,
);
const report = buildReport(ALL_ITEMS, issues, { color });
console.log(report.text);
process.exitCode = exitCode(report, strict);
