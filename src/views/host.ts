import type { Registry } from '../core/registry';
import type { RoomGeo } from '../core/room';
import type { Layout, Selection } from '../core/types';
import type { WallKey } from '../data/schema';

/** Ba kiểu xem. */
export type Mode = 'plan' | 'elev' | '3d';

/** Bút màu: lấy màu từ bản vẽ, chấm màu sang chỗ khác, hoặc tắt. */
export type PenTool = 'pick' | 'paint' | null;

/** Chỗ trên bản vẽ mà bút màu chạm vào. */
export type PenTarget = { kind: 'floor' } | { kind: 'wall' } | { kind: 'item'; sel: Selection };

/** Nơi thả một món từ thư viện. Tọa độ tính bằng cm. */
export type DropAt =
  | { kind: 'plan'; x: number; y: number }
  /** s: vị trí dọc tường. y: độ cao mép dưới, null thì lấy theo khai báo của món. */
  | { kind: 'wall'; wall: WallKey; s: number; y: number | null };

/** Phần trạng thái mà các view cần đọc. */
export interface ViewState {
  mode: Mode;
  wall: WallKey;
  sel: Selection | null;
  /** Hiện kích thước và khoảng cách tới tường. */
  dim: boolean;
  /** Bám lưới 5 cm. */
  snap: boolean;
  pen: PenTool;
}

/**
 * Những gì views cần từ ứng dụng. views không biết gì về giao diện xung quanh (thư viện, bảng thuộc tính, hộp thoại):
 * mọi thay đổi đi qua đây, và ứng dụng lo vẽ lại, ghi Hoàn tác, lưu.
 */
export interface Host {
  readonly registry: Registry;
  layout(): Layout;
  geo(): RoomGeo;
  view(): Readonly<ViewState>;
  /** Chọn món, hoặc bỏ chọn khi null. */
  select(sel: Selection | null): void;
  /** Đang kéo hay xoay: vẽ lại và cập nhật bảng thuộc tính, chưa ghi Hoàn tác. */
  changing(): void;
  /** Hết một thao tác: ghi Hoàn tác và lưu. */
  changed(): void;
  pen(target: PenTarget | null): void;
  /** at là null khi bấm vào thư viện thay vì thả: app tự chọn chỗ. */
  drop(id: string, at: DropAt | null): void;
  rotateBy(delta: number): void;
  removeSelected(): void;
  /** Báo ngắn gọn cho người dùng, ví dụ khi thao tác bị chặn vì món đã khóa. */
  notice(text: string): void;
}
