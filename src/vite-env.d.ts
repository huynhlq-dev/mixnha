/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Tên sản phẩm, đặt trong file .env */
  readonly VITE_APP_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
