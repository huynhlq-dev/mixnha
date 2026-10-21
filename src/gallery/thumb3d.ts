import type { Mesh } from 'three';
import type { ItemDef } from '../data/schema';

/**
 * Ảnh 3D nhỏ của từng món đặt sàn, để xem kiểu vẽ (giường, sofa, bồn cầu...) ngay trên trang gallery.
 * Dùng một khung WebGL chung cho mọi món rồi lấy ảnh PNG, nên không tốn mỗi món một khung WebGL.
 * Không có WebGL thì createThumbs trả về null và trang vẫn dùng bình thường (chỉ thiếu ảnh 3D).
 * three.js được nạp khi cần, không làm chậm lúc mở trang.
 */

export interface Thumbs {
  /** Ảnh PNG (data URL) của món, hoặc null nếu không dựng được. Cùng món và cùng màu thì dùng lại ảnh cũ. */
  of(def: ItemDef): string | null;
  dispose(): void;
}

/** Cạnh ảnh (px). Ảnh được vẽ ở độ phân giải gấp đôi cho màn hình nét. */
export const THUMB_SIZE = 144;

export async function createThumbs(): Promise<Thumbs | null> {
  try {
    const T = await import('three');
    const { shapeFor } = await import('../views/shapes');

    const px = THUMB_SIZE * 2;
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(px, px, false);
    renderer.setClearColor(0x000000, 0);

    const scene = new T.Scene();
    scene.add(new T.AmbientLight(0xffffff, 0.72));
    const sun = new T.DirectionalLight(0xffffff, 0.3);
    sun.position.set(300, 800, -200);
    scene.add(sun);
    const camera = new T.OrthographicCamera(-1, 1, 1, -1, 1, 20000);

    const cache = new Map<string, string | null>();

    const draw = (def: ItemDef): string | null => {
      const g = new T.Group();
      shapeFor(def.shape)({ g, w: def.w, d: def.d, h: def.h, color: new T.Color(def.color) });
      scene.add(g);
      try {
        const box = new T.Box3().setFromObject(g);
        const size = box.getSize(new T.Vector3());
        const center = box.getCenter(new T.Vector3());
        const half = Math.max(1, size.length() / 2) * 1.08;
        camera.left = -half;
        camera.right = half;
        camera.top = half;
        camera.bottom = -half;
        camera.updateProjectionMatrix();
        // nhìn từ phía trước món (mặt trước hướng về -z), hơi chếch phải và từ trên xuống
        camera.position.copy(center).add(new T.Vector3(0.9, 0.8, -1.1).normalize().multiplyScalar(half * 4));
        camera.lookAt(center);
        renderer.render(scene, camera);
        return canvas.toDataURL('image/png');
      } finally {
        scene.remove(g);
        g.traverse((o) => {
          const m = o as Mesh;
          m.geometry?.dispose?.();
          const mat = m.material;
          if (Array.isArray(mat)) for (const x of mat) x.dispose();
          else mat?.dispose?.();
        });
      }
    };

    return {
      of(def) {
        const key = `${def.id}|${def.w}|${def.d}|${def.h}|${def.color}|${def.shape ?? ''}`;
        if (cache.has(key)) return cache.get(key) ?? null;
        let url: string | null = null;
        try {
          url = draw(def);
        } catch {
          url = null;
        }
        cache.set(key, url);
        return url;
      },
      dispose() {
        cache.clear();
        renderer.dispose();
        renderer.forceContextLoss();
      },
    };
  } catch {
    return null;
  }
}
