import type { RoomDimKey } from '../core/limits';
import type { AnyItem, DoorItem, FloorItem, Layout, OpeningKind, Scope, WallItem, WindowItem } from '../core/types';
import { isWallKey } from '../data/walls';
import type { WallKey } from '../data/schema';
import type { Mode } from '../views/host';
import type { Els } from './els';
import { markSwatches } from './swatches';

/** Món đang chọn, kèm thông tin lấy từ thư viện. */
export interface SelModel {
  scope: Scope;
  item: AnyItem;
  /** Lời khuyên của món trong thư viện. */
  note: string | undefined;
  /** Món không có trong thư viện (do file đưa vào). */
  custom: boolean;
}

/** Cửa đi hoặc cửa sổ đang chọn, kèm khoảng cho phép của vị trí và chiều rộng. */
export interface OpeningModel {
  kind: OpeningKind;
  item: DoorItem | WindowItem;
  ranges: { pos: { min: number; max: number }; w: { min: number; max: number } };
}

export interface PropsModel {
  layout: Layout;
  mode: Mode;
  sel: SelModel | null;
  opening: OpeningModel | null;
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

/** Chỉ ghi vào ô khi người dùng không đang gõ trong ô đó, để không giật chữ đang gõ. */
function setVal(el: HTMLInputElement, v: string | number): void {
  if (document.activeElement !== el) el.value = String(v);
}

export function emptyText(mode: Mode): string {
  if (mode === '3d') return 'Bấm vào một món trong khung 3D để chọn, kéo để di chuyển, rồi đổi màu, kích thước, xoay hoặc xóa ngay ở đây.';
  if (mode === 'elev') return 'Bấm vào một món trên tường để đổi màu, kích thước và độ cao so với sàn. Bấm vào cửa đi hoặc cửa sổ để dời chỗ.';
  return 'Bấm vào một món trên bản vẽ để đổi màu, xoay, xem kích thước. Bấm vào cửa đi hoặc cửa sổ trên tường để dời chỗ.';
}

export function paintRotation(els: Els, it: FloorItem): void {
  els.knobDial.style.transform = `rotate(${it.rot}deg)`;
  setVal(els.selRot, round1(it.rot));
}

/** Cập nhật cột bên phải (phòng, màu, món đang chọn) và các nút thao tác nhanh theo dữ liệu hiện tại. */
export function updateProps(els: Els, m: PropsModel): void {
  const { layout: l, sel, opening: op } = m;
  markSwatches(els.floorSw, l.floor);
  markSwatches(els.wallSw, l.wall);
  setVal(els.rW, l.W);
  setVal(els.rH, l.H);
  setVal(els.rC, l.ceil);

  els.selHead.textContent = op ? (op.kind === 'door' ? 'Cửa đi đang chọn' : 'Cửa sổ đang chọn') : 'Món đang chọn';
  els.selEmpty.hidden = !!sel || !!op;
  els.selBox.hidden = !sel;
  els.opBox.hidden = !op;
  els.selEmpty.textContent = emptyText(m.mode);
  if (op) paintOpening(els, op);

  const onWall = !!sel && sel.scope !== 'floor';
  const locked = !!sel?.item.locked;
  if (sel) {
    const it = sel.item;
    els.selName.textContent = it.name;
    els.selCustom.hidden = !sel.custom;
    els.selNote.hidden = !sel.note;
    els.selNote.textContent = sel.note ?? '';
    els.lblSize.textContent = onWall ? 'Rộng × cao (cm)' : 'Rộng × sâu (cm)';
    els.selD.setAttribute('aria-label', onWall ? 'Cao' : 'Sâu');
    setVal(els.selW, it.w);
    setVal(els.selD, onWall ? (it as WallItem).h : (it as FloorItem).d);
    els.fieldY.hidden = !onWall;
    if (onWall) setVal(els.selY, it.y);
    els.fieldRot.hidden = onWall;
    if (!onWall) paintRotation(els, it as FloorItem);
    markSwatches(els.itemSw, it.color);
    els.btnLock.setAttribute('aria-pressed', String(locked));
    els.lockHint.hidden = !locked;
    // món đã khóa: chỉ đổi màu được, còn lại tắt để người dùng thấy ngay vì sao không sửa được
    for (const el of [els.selW, els.selD, els.selY, els.selRot, els.btnRotL, els.btnRotR, els.rotKnob, els.btnDel]) el.disabled = locked;
  }

  // nút xoay nhanh dùng cho đồ sàn chưa khóa, và cho cửa đi (xoay hướng mở cánh)
  els.mRotL.disabled = els.mRotR.disabled = !((!!sel && !onWall && !locked) || op?.kind === 'door');
  els.mDup.disabled = !sel;
  els.mDel.disabled = (!sel && !op) || locked;
}

function paintOpening(els: Els, op: OpeningModel): void {
  const o = op.item;
  for (const b of els.opWalls.querySelectorAll<HTMLElement>('[data-wall]')) b.setAttribute('aria-pressed', String(b.dataset.wall === o.wall));
  els.lblOpPos.textContent = o.wall === 'T' || o.wall === 'B' ? 'Cách góc trái (cm)' : 'Cách góc trên (cm)';
  els.opPos.min = String(op.ranges.pos.min);
  els.opPos.max = String(op.ranges.pos.max);
  els.opW.min = String(op.ranges.w.min);
  els.opW.max = String(op.ranges.w.max);
  setVal(els.opPos, o.pos);
  setVal(els.opW, o.w);
  els.opDoor.hidden = op.kind !== 'door';
  els.opSwing.setAttribute('aria-pressed', String(op.kind === 'door' && (o as DoorItem).swing === 'out'));
}

export interface PropsApp {
  /** Trả về giá trị đã dùng (sau khi kẹp vào khoảng cho phép) để ô nhập hiện đúng số đó, hoặc null nếu chưa áp dụng gì. */
  setRoomDim(key: RoomDimKey, raw: string, final: boolean): number | null;
  /** Ô thứ hai của cặp rộng × sâu là "d": sâu với đồ sàn, cao với đồ tường. */
  setField(field: 'w' | 'd' | 'y', raw: string, final: boolean): number | null;
  /** Cửa đang chọn: đổi vị trí (cách góc, cm) hoặc chiều rộng. Trả về số đã dùng, hoặc null nếu chưa áp dụng gì. */
  setOpening(field: 'pos' | 'w', raw: string, final: boolean): number | null;
  /** Chuyển cửa đang chọn sang tường khác. */
  setOpeningWall(wall: WallKey): void;
  /** Cửa đi đang chọn: đổi bên bản lề, hoặc đổi mở vào trong, ra ngoài. */
  flipDoorHinge(): void;
  toggleDoorSwing(): void;
  /** Trả về góc đã dùng (đưa về 0 đến 360), hoặc null nếu món không xoay được. */
  setRotation(deg: number, final: boolean): number | null;
  rotateBy(delta: number): void;
  toggleLock(): void;
  duplicate(): void;
  removeSelected(): void;
  /** Núm xoay tự do. knobStart trả về góc hiện tại, hoặc null nếu món không xoay được. */
  knobStart(): number | null;
  knobMove(deg: number, shift: boolean): void;
  knobEnd(): void;
}

/** Gắn sự kiện cho cột bên phải. Gõ dở thì áp dụng ngay số hợp lệ; rời ô hoặc bấm Enter thì kẹp về khoảng cho phép. */
export function bindProps(els: Els, app: PropsApp): void {
  const dims: [HTMLInputElement, RoomDimKey][] = [
    [els.rW, 'W'],
    [els.rH, 'H'],
    [els.rC, 'ceil'],
  ];
  for (const [el, key] of dims) {
    el.addEventListener('input', () => void app.setRoomDim(key, el.value, false));
    el.addEventListener('change', () => {
      const v = app.setRoomDim(key, el.value, true);
      if (v !== null) el.value = String(v);
    });
  }
  const fields: [HTMLInputElement, 'w' | 'd' | 'y'][] = [
    [els.selW, 'w'],
    [els.selD, 'd'],
    [els.selY, 'y'],
  ];
  for (const [el, field] of fields) {
    el.addEventListener('input', () => void app.setField(field, el.value, false));
    el.addEventListener('change', () => {
      const v = app.setField(field, el.value, true);
      if (v !== null) el.value = String(v);
    });
  }
  const openingFields: [HTMLInputElement, 'pos' | 'w'][] = [
    [els.opPos, 'pos'],
    [els.opW, 'w'],
  ];
  for (const [el, field] of openingFields) {
    el.addEventListener('input', () => void app.setOpening(field, el.value, false));
    el.addEventListener('change', () => {
      const v = app.setOpening(field, el.value, true);
      if (v !== null) el.value = String(v);
    });
  }
  els.opDel.addEventListener('click', () => app.removeSelected());
  els.opFlip.addEventListener('click', () => app.flipDoorHinge());
  els.opSwing.addEventListener('click', () => app.toggleDoorSwing());
  els.opWalls.addEventListener('click', (e) => {
    const w = (e.target as Element).closest<HTMLElement>('[data-wall]')?.dataset.wall;
    if (isWallKey(w)) app.setOpeningWall(w);
  });
  els.selRot.addEventListener('input', () => {
    const v = parseFloat(els.selRot.value);
    if (Number.isFinite(v)) app.setRotation(v, false);
  });
  els.selRot.addEventListener('change', () => {
    const v = parseFloat(els.selRot.value);
    if (!Number.isFinite(v)) return;
    const used = app.setRotation(v, true);
    if (used !== null) els.selRot.value = String(used);
  });
  els.btnRotL.addEventListener('click', () => app.rotateBy(-90));
  els.btnRotR.addEventListener('click', () => app.rotateBy(90));
  els.btnLock.addEventListener('click', () => app.toggleLock());
  els.btnDup.addEventListener('click', () => app.duplicate());
  els.btnDel.addEventListener('click', () => app.removeSelected());

  // núm xoay tự do: nhấn giữ rồi kéo quanh vòng tròn, góc quay theo con trỏ
  const knob = els.rotKnob;
  let drag: { cx: number; cy: number; a0: number; rot0: number } | null = null;
  knob.addEventListener('pointerdown', (e) => {
    const rot0 = app.knobStart();
    if (rot0 === null) return;
    e.preventDefault();
    const rc = knob.getBoundingClientRect();
    const cx = rc.left + rc.width / 2;
    const cy = rc.top + rc.height / 2;
    drag = { cx, cy, a0: Math.atan2(e.clientY - cy, e.clientX - cx), rot0 };
    try {
      knob.setPointerCapture(e.pointerId);
    } catch {
      /* vẫn dùng được */
    }
  });
  knob.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const a = Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx);
    app.knobMove(drag.rot0 + ((a - drag.a0) * 180) / Math.PI, e.shiftKey);
  });
  const end = (): void => {
    if (!drag) return;
    drag = null;
    app.knobEnd();
  };
  knob.addEventListener('pointerup', end);
  knob.addEventListener('pointercancel', end);
}
