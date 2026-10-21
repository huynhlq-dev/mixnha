import { BoxGeometry, Color, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshLambertMaterial } from 'three';

export interface BoxOptions {
  /** 0 đến 1. Có giá trị thì khối trong suốt (kính). */
  opacity?: number;
  /** Không vẽ viền khối (chân bàn, kính). */
  noEdge?: boolean;
}

/** Thêm một khối hộp vào nhóm g. (x, y, z) là tâm khối, y hướng lên. */
export function addBox(g: Group, w: number, h: number, d: number, x: number, y: number, z: number, color: Color | number | string, o: BoxOptions = {}): Mesh {
  const geo = new BoxGeometry(w, h, d);
  const mat = new MeshLambertMaterial({ color });
  if (o.opacity !== undefined) {
    mat.transparent = true;
    mat.opacity = o.opacity;
    mat.depthWrite = false;
  }
  const mesh = new Mesh(geo, mat);
  mesh.position.set(x, y, z);
  g.add(mesh);
  if (!o.noEdge) {
    const edge = new LineSegments(new EdgesGeometry(geo), new LineBasicMaterial({ color: 0x15211e, transparent: true, opacity: 0.3 }));
    edge.position.copy(mesh.position);
    edge.userData.edge = true;
    g.add(edge);
  }
  return mesh;
}

/** Màu tối đi (f < 1) hoặc sáng lên (f > 1) từ một màu gốc. */
export function shade(hex: Color | number | string, f: number): Color {
  const c = new Color(hex);
  if (f < 1) c.multiplyScalar(f);
  else c.lerp(new Color(1, 1, 1), Math.min(1, f - 1));
  return c;
}

/** Gọi fn tại bốn góc, lùi vào 5 cm so với mép (chỗ đặt chân bàn, chân ghế). */
export function corners(w: number, d: number, fn: (x: number, z: number) => void): void {
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    fn(sx * (w / 2 - 5), sz * (d / 2 - 5));
  }
}

/** Mọi thứ một hàm dựng cần để vẽ một món. Gốc tọa độ ở tâm món trên mặt sàn, mặt trước của món hướng về -z. */
export interface ShapeCtx {
  g: Group;
  w: number;
  d: number;
  h: number;
  color: Color;
}

export type ShapeBuilder = (c: ShapeCtx) => void;
