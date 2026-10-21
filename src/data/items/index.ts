import type { ItemDef } from '../schema';
import { BATHROOM } from './bathroom';
import { DINING } from './dining';
import { LIVING } from './living';
import { SLEEPING } from './sleeping';
import { WALL } from './wall';
import { WORK } from './work';

/**
 * Gom mọi file dữ liệu đồ thành một danh sách. Thêm file mới thì import và nối vào đây.
 * Thứ tự trong danh sách là thứ tự trong thư viện (theo từng nhóm).
 */
export const ALL_ITEMS: readonly ItemDef[] = [...SLEEPING, ...LIVING, ...DINING, ...WORK, ...BATHROOM, ...WALL];
