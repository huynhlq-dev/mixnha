import type { Registry } from '../core/registry';
import type { RoomGeo } from '../core/room';
import type { AptPlan, Layout, OpeningSel, Selection } from '../core/types';
import type { RoomId } from '../data/rooms';
import type { WallKey } from '../data/schema';
import type { AptRect, AptRoom } from './apartment';

/** Ba kiểu xem. */
export type Mode = 'plan' | 'elev' | '3d';

/** Bút màu: lấy màu từ bản vẽ, chấm màu sang chỗ khác, hoặc tắt. */
export type PenTool = 'pick' | 'paint' | null;

/** Chỗ trên bản vẽ mà bút màu chạm vào. */
export type PenTarget = { kind: 'floor' } | { kind: 'wall' } | { kind: 'item'; sel: Selection };

/** Nơi thả một món từ thư viện. Tọa độ tính bằng cm. */
export type DropAt =
  | { kind: 'plan'; x: number; y: number }
  /** Thả vào mô hình cả căn hộ: chỗ thả theo tọa độ căn hộ (cm). Thả đồ thì app tìm phòng chứa điểm này; thả loại phòng thì đây là tâm phòng mới. */
  | { kind: 'apartment'; x: number; y: number }
  /** s: vị trí dọc tường. y: độ cao mép dưới, null thì lấy theo khai báo của món. */
  | { kind: 'wall'; wall: WallKey; s: number; y: number | null };

/** Phần trạng thái mà các view cần đọc. */
export interface ViewState {
  mode: Mode;
  wall: WallKey;
  sel: Selection | null;
  /** Cửa đi hoặc cửa sổ đang chọn. Không bao giờ có cùng lúc với sel. */
  opening: OpeningSel | null;
  /** Đang xem mô hình cả căn hộ (chưa vào phòng nào). */
  overview: boolean;
  /** Ở mô hình cả căn: đang bật chỉnh bố cục (kéo phòng, đổi cỡ phòng) thay vì sửa đồ trong phòng. */
  aptEdit: boolean;
  /** Phòng đang chọn trên mô hình. */
  aptSel: RoomId | null;
  /** Hiện kích thước và khoảng cách tới tường. */
  dim: boolean;
  /** Kích thước chi tiết của món đang chọn, nhãn nằm ngay trên từng cạnh. */
  detail: boolean;
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
  /** Mọi phòng của căn hộ, để vẽ mô hình cả căn. */
  apartment(): AptRoom[];
  /** Từ mô hình cả căn hộ: chọn một phòng để zoom vào và thiết kế. */
  openRoom(id: RoomId): void;
  /** Vị trí đã chốt của các phòng trong mô hình cả căn (phòng chưa có thì tự xếp lưới). */
  aptPlan(): AptPlan;
  /** Vị trí và cỡ hiện tại của mọi phòng trong mô hình, theo tọa độ căn hộ (cm). */
  aptRects(): Record<RoomId, AptRect>;
  /** Thứ tự lớp của các phòng từ dưới lên trên (phòng nằm trên che phòng nằm dưới khi chồng nhau). */
  aptStack(): RoomId[];
  /**
   * Mô hình cả căn: từ giờ thao tác (chọn đồ, kéo, bút màu) là trên phòng này, tức layout() và geo() trả về phòng này.
   * Đổi sang phòng khác thì bỏ chọn món cũ.
   */
  focusRoom(id: RoomId): void;
  /** Mô hình cả căn: kéo món đang chọn sang phòng `to`, tâm món đặt tại p (tọa độ của phòng đó). Trả về false nếu không chuyển được (phòng đầy). */
  transferItem(sel: Selection, to: RoomId, p: { x: number; y: number }): boolean;
  /** Chọn một phòng (bỏ chọn món), hoặc bỏ chọn phòng khi null. Phòng được chọn thành phòng hiện tại. */
  aptSelect(id: RoomId | null): void;
  /** Đang kéo phòng: góc trên trái mong muốn là (x, y) cm. App bám lưới, hút vào mép phòng khác, tránh chồng phòng khác rồi vẽ lại. */
  aptMoveTo(id: RoomId, x: number, y: number): void;
  /** Đang kéo tay nắm đổi cỡ: rộng, cao mong muốn (cm), góc trên trái đứng yên. */
  aptResizeTo(id: RoomId, w: number, h: number): void;
  /** Thả chuột xong một lần kéo: ghi Hoàn tác, lưu, rồi chỉnh khung nhìn cho vừa cả căn. */
  aptCommit(): void;
  view(): Readonly<ViewState>;
  /** Chọn món, hoặc bỏ chọn khi null. */
  select(sel: Selection | null): void;
  /** Chọn cửa đi hoặc cửa sổ, hoặc bỏ chọn khi null. */
  selectOpening(sel: OpeningSel | null): void;
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
