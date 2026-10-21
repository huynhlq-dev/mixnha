import type { CategoryDef, ItemDef, Place } from '../data/schema';
import { CATEGORIES } from '../data/categories';
import { ALL_ITEMS } from '../data/items';

export interface Registry {
  readonly items: readonly ItemDef[];
  readonly categories: readonly CategoryDef[];
  /** Tra theo mã, đúng nguyên văn (kể cả món đã retired). */
  get(id: string): ItemDef | undefined;
  /** Tra theo mã, nếu món đã retired thì đi theo replacedBy tới món còn dùng. */
  resolve(id: string): ItemDef | undefined;
  /** Món người dùng được thấy trong thư viện (status live), theo thứ tự khai báo. */
  live(place?: Place): ItemDef[];
  category(id: string): CategoryDef | undefined;
}

/** Số bước tối đa khi đi theo replacedBy, chống vòng lặp do khai báo sai. */
const MAX_HOPS = 8;

export function createRegistry(items: readonly ItemDef[], categories: readonly CategoryDef[]): Registry {
  const byId = new Map<string, ItemDef>();
  for (const it of items) if (!byId.has(it.id)) byId.set(it.id, it);
  const catById = new Map(categories.map((c) => [c.id, c]));

  return {
    items,
    categories,
    get: (id) => byId.get(id),
    resolve(id) {
      let cur = byId.get(id);
      for (let i = 0; cur && cur.status === 'retired' && i < MAX_HOPS; i++) {
        cur = cur.replacedBy ? byId.get(cur.replacedBy) : undefined;
      }
      return cur && cur.status !== 'retired' ? cur : undefined;
    },
    live: (place) => items.filter((it) => it.status === 'live' && (!place || it.place === place)),
    category: (id) => catById.get(id),
  };
}

/** Thư viện đồ của ứng dụng. */
export const registry: Registry = createRegistry(ALL_ITEMS, CATEGORIES);
