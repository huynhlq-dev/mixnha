import { LIMITS } from '../core/limits';
import type { Layout } from '../core/types';
import type { RoomId } from '../data/rooms';

interface RoomHistory {
  undo: string[];
  redo: string[];
  /** Ảnh chụp (JSON) của bố trí hiện tại. */
  cur: string;
}

export interface HistoryOptions {
  limit?: number;
  /** Các thao tác liên tục (gõ số, kéo ô màu, phím mũi tên) trong khoảng này gộp thành một bước. */
  mergeMs?: number;
  now?: () => number;
}

/** Lịch sử Hoàn tác / Làm lại, riêng cho từng phòng. */
export class History {
  private rooms = new Map<RoomId, RoomHistory>();
  private lastAt = 0;
  private lastContinuous = false;
  private lastRoom: RoomId | null = null;
  private pushed = false;
  private readonly limit: number;
  private readonly mergeMs: number;
  private readonly now: () => number;

  constructor(opts: HistoryOptions = {}) {
    this.limit = opts.limit ?? LIMITS.undoSteps;
    this.mergeMs = opts.mergeMs ?? 1000;
    this.now = opts.now ?? Date.now;
  }

  /** Đặt lại toàn bộ lịch sử, lấy bố trí hiện có làm điểm xuất phát. */
  reset(layouts: Record<RoomId, Layout>): void {
    this.rooms.clear();
    for (const [room, l] of Object.entries(layouts) as [RoomId, Layout][]) {
      this.rooms.set(room, { undo: [], redo: [], cur: JSON.stringify(l) });
    }
    this.lastContinuous = false;
    this.lastRoom = null;
  }

  /**
   * Ghi một bước nếu bố trí đã khác lần trước. Trả về true nếu có thay đổi.
   * continuous = true cho thao tác liên tục, sẽ gộp với bước trước nếu cùng phòng và trong thời gian gộp.
   */
  commit(room: RoomId, layout: Layout, continuous: boolean): boolean {
    const h = this.rooms.get(room);
    if (!h) return false;
    const snap = JSON.stringify(layout);
    if (snap === h.cur) return false;
    const t = this.now();
    const merge = continuous && this.lastContinuous && this.lastRoom === room && t - this.lastAt < this.mergeMs && h.undo.length > 0;
    this.pushed = !merge;
    if (!merge) {
      h.undo.push(h.cur);
      if (h.undo.length > this.limit) h.undo.shift();
    }
    h.redo = [];
    h.cur = snap;
    this.lastAt = t;
    this.lastContinuous = continuous;
    this.lastRoom = room;
    return true;
  }

  /** Lần commit vừa rồi (đã ghi) có thêm một bước mới, hay chỉ gộp vào bước trước (thao tác liên tục). */
  get lastWasNewStep(): boolean {
    return this.pushed;
  }

  /** Thêm một phòng mới (hoặc phòng vừa lấy lại): lịch sử riêng, lấy bố trí này làm điểm xuất phát. */
  add(room: RoomId, layout: Layout): void {
    this.rooms.set(room, { undo: [], redo: [], cur: JSON.stringify(layout) });
    if (this.lastRoom === room) this.lastContinuous = false;
  }

  /** Bỏ lịch sử của một phòng đã xóa. */
  remove(room: RoomId): void {
    this.rooms.delete(room);
    if (this.lastRoom === room) {
      this.lastRoom = null;
      this.lastContinuous = false;
    }
  }

  canUndo(room: RoomId): boolean {
    return (this.rooms.get(room)?.undo.length ?? 0) > 0;
  }

  canRedo(room: RoomId): boolean {
    return (this.rooms.get(room)?.redo.length ?? 0) > 0;
  }

  /** Lùi một bước. Trả về bố trí cần áp dụng, hoặc null nếu hết bước. */
  undo(room: RoomId): Layout | null {
    const h = this.rooms.get(room);
    if (!h || !h.undo.length) return null;
    h.redo.push(h.cur);
    h.cur = h.undo.pop()!;
    this.lastContinuous = false;
    return JSON.parse(h.cur) as Layout;
  }

  redo(room: RoomId): Layout | null {
    const h = this.rooms.get(room);
    if (!h || !h.redo.length) return null;
    h.undo.push(h.cur);
    h.cur = h.redo.pop()!;
    this.lastContinuous = false;
    return JSON.parse(h.cur) as Layout;
  }
}
