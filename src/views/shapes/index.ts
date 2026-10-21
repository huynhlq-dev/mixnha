import type { ShapeId } from '../../data/shapes';
import { bed } from './bed';
import { box } from './box';
import { chair } from './chair';
import { cooker } from './cooker';
import { shower } from './shower';
import { sofa } from './sofa';
import { table } from './table';
import { toilet } from './toilet';
import type { ShapeBuilder } from './util';

/**
 * Bảng tra: mỗi kiểu vẽ trong data/shapes.ts có một hàm dựng 3D ở đây.
 * Thêm tên vào SHAPE_IDS mà chưa viết hàm dựng thì TypeScript báo lỗi ngay chỗ này.
 */
export const SHAPES: Record<ShapeId, ShapeBuilder> = { box, bed, sofa, chair, table, toilet, cooker, shower };

/** Hàm dựng cho một món. Kiểu lạ hoặc không ghi thì dùng hình hộp, để trang không vỡ. */
export function shapeFor(id: string | undefined): ShapeBuilder {
  return (id !== undefined && Object.prototype.hasOwnProperty.call(SHAPES, id) ? SHAPES[id as ShapeId] : undefined) ?? box;
}

export type { ShapeBuilder, ShapeCtx } from './util';
