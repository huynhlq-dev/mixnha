/**
 * Kho khóa-giá trị nhỏ cho dữ liệu trong trình duyệt. Mọi lệnh đọc, ghi đều bọc try/catch vì
 * localStorage có thể bị chặn (cửa sổ ẩn danh, dữ liệu bị xóa, trang chạy trong khung bị khóa).
 */
export interface KV {
  get(key: string): string | null;
  /** Trả về false nếu không ghi được. */
  set(key: string, value: string): boolean;
  remove(key: string): void;
}

export function browserKV(): KV {
  return {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* bỏ qua */
      }
    },
  };
}

/** Kho trong bộ nhớ, dùng cho test và khi trình duyệt không cho ghi. */
export function memoryKV(initial: Record<string, string> = {}): KV {
  const m = new Map(Object.entries(initial));
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => {
      m.set(k, v);
      return true;
    },
    remove: (k) => {
      m.delete(k);
    },
  };
}
