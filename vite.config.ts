import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// base './' để thư mục dist chạy được từ bất kỳ đường dẫn nào (GitHub Pages, thư mục con, mở bằng server tĩnh).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // three.js nặng ~740 KB nhưng chỉ nạp khi mở 3D hoặc gallery, nên nâng ngưỡng cảnh báo để build không báo vàng mỗi lần
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        gallery: resolve(import.meta.dirname, 'gallery.html'),
      },
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
  },
});
