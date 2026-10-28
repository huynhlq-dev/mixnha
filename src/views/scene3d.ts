import {
  AmbientLight,
  Box3,
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
} from 'three';
import { analysePlan } from '../core/analyse';
import { clamp, snapAngle, wallLength, boxOf } from '../core/geometry';
import { canEdit, findItem, floorHeight, wallDepth } from '../core/layout';
import { LIMITS } from '../core/limits';
import { openingsOn, type RoomGeo } from '../core/room';
import { coversOf } from '../core/overlap';
import type { Box } from '../core/interior';
import { roomTypeFromDragId } from '../core/rooms';
import type { FloorItem, Layout, Selection, WallItem } from '../core/types';
import { WALL_KEYS } from '../data/walls';
import type { WallKey } from '../data/schema';
import type { DropAt, Host, PenTarget } from './host';
import { shapeFor } from './shapes';
import { addBox, shade } from './shapes/util';
import { t } from '../i18n';

/** Gắn vào đối tượng 3D để biết con trỏ đang chạm vào cái gì. */
type Tag = { t: 'floor' } | { t: 'wall'; wl: WallKey } | { t: 'item'; sel: Selection } | { t: 'rot' };

type ItemDrag =
  | { key: 'plan'; sel: Selection; plane: Plane; dx: number; dy: number; moved: boolean }
  | { key: WallKey; sel: Selection; plane: Plane; dx: number; dy: number; moved: boolean }
  | { key: 'rot'; sel: Selection; plane: Plane; moved: boolean }
  | { key: 'locked'; told: boolean };

/** Một phòng trong cảnh: vị trí góc trên trái, cỡ, và bốn bức tường (để làm mờ tường chắn tầm nhìn). */
interface Rig {
  ox: number;
  oz: number;
  W: number;
  H: number;
  walls: Partial<Record<WallKey, Group>>;
  /** Tường nằm giữa camera và phòng (đang mờ). */
  faded: Record<WallKey, boolean>;
}

const WALL_THICKNESS = 10;
/** Lan can: chiều cao tay vịn (cm) và màu. */
const RAIL_TOP = 104;
const RAIL_COLOR = 0x8a949c;
const MIN_DIST = 150;
const MAX_DIST = 5000;
const CLICK_SLOP = 5;
const FOV = 40;

/** Màu theo biến CSS đang áp dụng (đúng cả khi bật chế độ tối). Đổi giao diện thì gọi themeChanged để lấy lại. */
function cssColor(name: string, fallback: string): Color {
  const v = typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : '';
  try {
    return new Color(v || fallback);
  } catch {
    return new Color(fallback);
  }
}

function tagOf(o: Object3D | null): Tag | null {
  for (let cur: Object3D | null = o; cur; cur = cur.parent) {
    const tag = cur.userData?.tg as Tag | undefined;
    if (tag) return tag;
  }
  return null;
}

/** Mảnh tường quanh các ô cửa: rects là phần tường đặc, glass là kính cửa sổ. Tọa độ [từ, tới, thấp, cao]. */
export function wallPieces(R: RoomGeo, wl: WallKey): { rects: [number, number, number, number][]; glass: [number, number, number, number][] } {
  const len = wallLength(R, wl);
  const C = R.ceil;
  const ops = openingsOn(R, wl).sort((a, b) => a.x0 - b.x0);
  const rects: [number, number, number, number][] = [];
  const glass: [number, number, number, number][] = [];
  let cur = 0;
  for (const p of ops) {
    if (p.x0 > cur) rects.push([cur, p.x0, 0, C]);
    if (p.y0 > 0) rects.push([p.x0, p.x1, 0, p.y0]);
    if (p.y1 < C) rects.push([p.x0, p.x1, p.y1, C]);
    if (p.kind === 'win') glass.push([p.x0, p.x1, p.y0, p.y1]);
    cur = Math.max(cur, p.x1);
  }
  if (cur < len) rects.push([cur, len, 0, C]);
  return { rects, glass };
}

type Piece = [number, number, number, number];

/**
 * Các đoạn của một bức tường (theo vị trí dọc tường, cm) nằm dưới phòng khác nên không xây: những hộp `covers` (tọa độ của phòng, đã gồm tường
 * của phòng che) chạm vào dải tường dày 10 cm của cạnh đó. Tường trên, phải tính từ trái, từ trên; tường dưới, trái tính ngược lại.
 */
function wallCuts(wl: WallKey, W: number, H: number, covers: readonly Box[]): [number, number][] {
  const T = WALL_THICKNESS;
  const band: Box = wl === 'T' ? { x: -T, y: -T, w: W + 2 * T, h: T } : wl === 'B' ? { x: -T, y: H, w: W + 2 * T, h: T } : wl === 'L' ? { x: -T, y: -T, w: T, h: H + 2 * T } : { x: W, y: -T, w: T, h: H + 2 * T };
  const out: [number, number][] = [];
  for (const c of covers) {
    if (!(c.x < band.x + band.w && c.x + c.w > band.x && c.y < band.y + band.h && c.y + c.h > band.y)) continue;
    out.push(wl === 'T' ? [c.x, c.x + c.w] : wl === 'B' ? [W - (c.x + c.w), W - c.x] : wl === 'R' ? [c.y, c.y + c.h] : [H - (c.y + c.h), H - c.y]);
  }
  return out;
}

/** Bỏ khỏi các mảnh tường những đoạn trong `cuts`. */
function clipPieces(pieces: readonly Piece[], cuts: readonly [number, number][]): Piece[] {
  let cur: Piece[] = pieces.map((p) => [...p] as Piece);
  for (const [c0, c1] of cuts) {
    const next: Piece[] = [];
    for (const [a, b, lo, hi] of cur) {
      if (c1 <= a || c0 >= b) next.push([a, b, lo, hi]);
      else {
        if (c0 > a) next.push([a, c0, lo, hi]);
        if (c1 < b) next.push([c1, b, lo, hi]);
      }
    }
    cur = next;
  }
  return cur;
}

/** Kích thước và tâm của một mảnh tường dày th. Tọa độ 3D: x ngang, y lên, z là chiều dọc của mặt bằng. */
function placeWall(wl: WallKey, R: RoomGeo, r: [number, number, number, number], th: number): { s: [number, number, number]; p: [number, number, number] } {
  const ds = r[1] - r[0];
  const dh = r[3] - r[2];
  const sm = (r[0] + r[1]) / 2;
  const ym = (r[2] + r[3]) / 2;
  if (wl === 'T') return { s: [ds, dh, th], p: [sm, ym, -5] };
  if (wl === 'B') return { s: [ds, dh, th], p: [R.W - sm, ym, R.H + 5] };
  if (wl === 'L') return { s: [th, dh, ds], p: [-5, ym, R.H - sm] };
  return { s: [th, dh, ds], p: [R.W + 5, ym, sm] };
}

/** Vị trí dọc tường theo cùng quy ước với mặt đứng (trái sang phải khi đứng trong phòng nhìn vào tường). */
function wallS(wl: WallKey, p: Vector3, R: RoomGeo): number {
  return wl === 'T' ? p.x : wl === 'B' ? R.W - p.x : wl === 'L' ? R.H - p.z : p.z;
}

function wallNormal(wl: WallKey): Vector3 {
  return wl === 'T' || wl === 'B' ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0);
}

function disposeGroup(g: Object3D): void {
  g.traverse((o) => {
    const m = o as Mesh;
    m.geometry?.dispose();
    const mat = m.material as Material | Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}

/**
 * Cảnh 3D dựng từ cùng dữ liệu với mặt bằng (x → x, y mặt bằng → z, độ cao → y).
 * Kéo nền để xoay, kéo món để di chuyển, cuộn hoặc chụm hai ngón để phóng to.
 */
export class Scene3D {
  private renderer: WebGLRenderer | null = null;
  private scene: Scene | null = null;
  private camera: PerspectiveCamera | null = null;
  private content: Group | null = null;
  /** Từng phòng đang dựng: một phòng khi xem một phòng, nhiều phòng khi xem cả căn hộ. */
  private rigs: Rig[] = [];
  private msg: HTMLElement | null = null;

  private yaw = -0.75;
  private pitch = 0.62;
  private dist = 900;
  /** Hộp bao của cảnh (một phòng, hoặc cả căn hộ): góc trên trái trên mặt sàn, rộng, dọc, cao (cm). Camera nhìn vào tâm hộp này. */
  private ox = 0;
  private oz = 0;
  private W = 400;
  private H = 350;
  private C = 270;

  private raf = 0;
  private active = false;
  private dirty = true;
  private roomKey: string | null = null;
  private ptr = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private downAt: { x: number; y: number } | null = null;
  private idrag: ItemDrag | null = null;
  private ro: ResizeObserver | null = null;
  private failedFlag = false;
  private sizeW = 0;
  private sizeH = 0;
  private readonly off: (() => void)[] = [];

  constructor(
    private readonly box: HTMLElement,
    private readonly host: Host,
  ) {}

  get failed(): boolean {
    return this.failedFlag;
  }

  /* ---------- Vòng đời ---------- */

  /** Hiện cảnh 3D: khởi tạo ở lần đầu, dựng lại theo dữ liệu hiện tại và bắt đầu vẽ. */
  show(): void {
    if (!this.renderer && !this.failedFlag) this.init();
    if (!this.renderer) return;
    this.active = true;
    this.resize();
    const key = this.host.view().overview ? 'apartment' : this.host.geo().id;
    if (this.roomKey !== key) {
      this.roomKey = key;
      this.dirty = true;
      this.build();
      this.resetView(false);
    }
    this.invalidate();
  }

  hide(): void {
    this.active = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /**
   * Vẽ khung hình hiện tại rồi trả canvas để chụp ảnh. Phải gọi toBlob ngay trong cùng lượt chạy, vì bộ đệm WebGL bị xóa sau khi hiện lên màn hình.
   * Null nếu chưa có cảnh.
   */
  snapshotCanvas(): HTMLCanvasElement | null {
    if (!this.renderer || !this.scene || !this.camera) return null;
    this.applyCamera();
    this.fadeWalls();
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement;
  }

  /** Dữ liệu đã đổi: dựng lại cảnh ở khung hình kế tiếp. */
  invalidate(): void {
    this.dirty = true;
    this.start();
  }

  /** Đã đổi giao diện sáng, tối: lấy lại màu nền rồi dựng lại cảnh để lưới và màu khung chọn theo màu mới. */
  themeChanged(): void {
    if (this.scene) this.scene.background = cssColor('--surface', '#ffffff');
    this.invalidate();
  }

  /** Đổi phòng thì lần show kế tiếp đặt lại góc nhìn. */
  forgetRoom(): void {
    this.roomKey = null;
  }

  dispose(): void {
    this.hide();
    for (const f of this.off) f();
    this.off.length = 0;
    this.ro?.disconnect();
    if (this.content) disposeGroup(this.content);
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.msg?.remove();
    this.renderer = null;
  }

  private init(): void {
    let r: WebGLRenderer;
    try {
      r = new WebGLRenderer({ antialias: true });
    } catch {
      this.fail(t('Trình duyệt này không bật WebGL nên chưa xem được 3D.'));
      return;
    }
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.box.insertBefore(r.domElement, this.box.firstChild);
    this.renderer = r;
    this.scene = new Scene();
    this.scene.background = cssColor('--surface', '#ffffff');
    this.camera = new PerspectiveCamera(FOV, 1.6, 5, 12000);
    // ánh sáng vừa phải để màu 3D gần đúng màu đã chọn: mặt trên khoảng 100%, mặt đứng 72 đến 80%
    this.scene.add(new AmbientLight(0xffffff, 0.72));
    const sun = new DirectionalLight(0xffffff, 0.3);
    sun.position.set(300, 800, 200);
    this.scene.add(sun);

    const el = r.domElement;
    this.on(el, 'pointerdown', (e) => this.onDown(e));
    this.on(el, 'pointermove', (e) => this.onMove(e));
    this.on(el, 'pointerup', (e) => this.onUp(e));
    this.on(el, 'pointercancel', (e) => this.onUp(e));
    this.on(el, 'dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    this.on(el, 'drop', (e) => this.onDrop(e));
    this.on(el, 'wheel', (e) => {
      e.preventDefault();
      this.zoom(1 + clamp(e.deltaY, -100, 100) * 0.001);
    }, { passive: false });
    this.onRaw(el, 'webglcontextlost', (e) => e.preventDefault());
    this.onRaw(el, 'webglcontextrestored', () => this.invalidate());
    this.on(this.box, 'keydown', (e) => this.onKey(e));

    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this.box);
    }
  }

  private on<K extends keyof HTMLElementEventMap>(el: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions): void {
    this.onRaw(el, type, fn as (e: Event) => void, opts);
  }

  private onRaw(el: HTMLElement, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void {
    el.addEventListener(type, fn, opts);
    this.off.push(() => el.removeEventListener(type, fn, opts));
  }

  private fail(text: string): void {
    this.failedFlag = true;
    const d = document.createElement('div');
    d.className = 'v3msg';
    d.textContent = text;
    this.box.append(d);
    this.msg = d;
  }

  private resize(): void {
    if (!this.renderer || !this.camera) return;
    const w = this.box.clientWidth;
    const h = this.box.clientHeight;
    if (!w || !h || (w === this.sizeW && h === this.sizeH)) return;
    this.sizeW = w;
    this.sizeH = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /* ---------- Camera ---------- */

  /** Khoảng cách camera để cả căn phòng vừa khung hình, theo cả chiều ngang lẫn chiều dọc của khung. */
  private fitDist(): number {
    const r = 0.5 * Math.sqrt(this.W * this.W + this.H * this.H + this.C * this.C);
    const a = this.camera?.aspect ?? 1.6;
    const v = (FOV * Math.PI) / 360;
    const hf = Math.atan(Math.tan(v) * a);
    return r / Math.sin(Math.min(v, hf));
  }

  resetView(top: boolean): void {
    this.yaw = -0.75;
    this.pitch = top ? 1.5 : 0.62;
    this.dist = clamp(this.fitDist() * (top ? 0.8 : 1), MIN_DIST, MAX_DIST);
  }

  viewIso(): void {
    this.resetView(false);
  }

  viewTop(): void {
    this.resetView(true);
  }

  zoom(f: number): void {
    this.dist = clamp(this.dist * f, MIN_DIST, MAX_DIST);
  }

  private applyCamera(): void {
    const cam = this.camera;
    if (!cam) return;
    const tx = this.ox + this.W / 2;
    const ty = this.C * 0.3;
    const tz = this.oz + this.H / 2;
    const cp = Math.cos(this.pitch);
    cam.position.set(tx + this.dist * cp * Math.sin(this.yaw), ty + this.dist * Math.sin(this.pitch), tz + this.dist * cp * Math.cos(this.yaw));
    cam.lookAt(tx, ty, tz);
  }

  /** Tường nằm giữa camera và phòng thì mờ đi để nhìn xuyên vào trong. */
  private fadeWalls(): void {
    const c = this.camera!.position;
    for (const rig of this.rigs) {
      rig.faded = { T: c.z < rig.oz - 5, B: c.z > rig.oz + rig.H + 5, L: c.x < rig.ox - 5, R: c.x > rig.ox + rig.W + 5 };
      for (const wl of WALL_KEYS) {
        const g = rig.walls[wl];
        if (!g) continue;
        const out = rig.faded[wl];
        for (const o of g.children) {
          if (o.userData.edge) {
            o.visible = !out;
          } else {
            const m = (o as Mesh).material as Material;
            m.transparent = out;
            m.opacity = out ? 0.1 : 1;
            m.depthWrite = !out;
          }
        }
      }
    }
  }

  /** Bức tường đối diện với camera, nơi đồ gắn tường được thả vào khi bấm thư viện. */
  farWall(): WallKey {
    const c = this.camera?.position;
    if (!c) return 'T';
    const R = this.host.geo();
    const dx = (c.x - R.W / 2) / R.W;
    const dz = (c.z - R.H / 2) / R.H;
    if (Math.abs(dz) >= Math.abs(dx)) return dz < 0 ? 'B' : 'T';
    return dx < 0 ? 'R' : 'L';
  }

  /* ---------- Vòng lặp vẽ ---------- */

  private start(): void {
    if (this.active && !this.raf && this.renderer) this.raf = requestAnimationFrame(() => this.loop());
  }

  private loop(): void {
    this.raf = 0;
    if (!this.active || !this.renderer || !this.scene || !this.camera) return;
    if (this.dirty) {
      this.dirty = false;
      this.build();
    }
    this.applyCamera();
    this.fadeWalls();
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(() => this.loop());
  }

  /* ---------- Dựng cảnh ---------- */

  private build(): void {
    const scene = this.scene;
    if (!scene) return;
    if (this.content) {
      scene.remove(this.content);
      disposeGroup(this.content);
    }
    const root = new Group();
    this.rigs = [];
    if (this.host.view().overview) this.buildApartment(root);
    else {
      const R = this.host.geo();
      this.ox = 0;
      this.oz = 0;
      this.W = R.W;
      this.H = R.H;
      this.C = R.ceil;
      this.buildRoom(root, this.host.layout(), R, true);
    }
    scene.add(root);
    this.content = root;
  }

  /** Cả căn hộ: mỗi phòng một nhóm đặt đúng vị trí trong mô hình, một lưới nền chung. Chỉ để xem nên không gắn nhãn chọn, không khung chọn. */
  private buildApartment(root: Group): void {
    const rooms = this.host.apartment();
    const rects = this.host.aptRects();
    // phòng nằm trên che phòng nằm dưới: dựng từ dưới lên, mỗi lớp nâng nhẹ để sàn không chập vào nhau, và bỏ tường phòng dưới ở chỗ bị che
    const stack = this.host.aptStack();
    const covers = coversOf(rects, stack);
    const byId = new Map(rooms.map((r) => [r.id, r]));
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    let ceil = 0;
    for (const [layer, id] of stack.entries()) {
      const room = byId.get(id);
      const rc = rects[id];
      if (!room || !rc) continue;
      const g = new Group();
      g.position.set(rc.x, layer * 0.4, rc.y);
      root.add(g);
      const local = (covers[id] ?? []).map((c) => ({ x: c.x - rc.x, y: c.y - rc.y, w: c.w, h: c.h }));
      const rig = this.buildRoom(g, room.layout, room.geo, false, local);
      rig.ox = rc.x;
      rig.oz = rc.y;
      x0 = Math.min(x0, rc.x);
      z0 = Math.min(z0, rc.y);
      x1 = Math.max(x1, rc.x + rc.w);
      z1 = Math.max(z1, rc.y + rc.h);
      ceil = Math.max(ceil, room.geo.ceil);
    }
    if (!this.rigs.length) return;
    this.ox = x0;
    this.oz = z0;
    this.W = x1 - x0;
    this.H = z1 - z0;
    this.C = ceil;
    const size = Math.ceil((Math.max(this.W, this.H) * 2.2) / 100) * 100;
    const grid = new GridHelper(size, size / 100, cssColor('--line', '#cbd5d1'), cssColor('--grid', '#dde4e1'));
    grid.position.set(x0 + this.W / 2, -4, z0 + this.H / 2);
    root.add(grid);
  }

  /**
   * Dựng một phòng vào `parent` (tọa độ của phòng: góc trên trái là 0, 0). interactive: có nhãn để chọn món, khung chọn và khung cảnh báo,
   * lưới nền riêng; không thì chỉ là hình để xem. covers: các hộp của phòng nằm trên che phòng này (không xây tường ở chỗ bị che).
   */
  private buildRoom(root: Group, L: Layout, R: RoomGeo, interactive: boolean, covers: readonly Box[] = []): Rig {
    const reg = this.host.registry;
    const v = this.host.view();
    const C = R.ceil;

    const floor = addBox(root, R.W, 4, R.H, R.W / 2, -2, R.H / 2, new Color(L.floor));
    if (interactive) floor.userData.tg = { t: 'floor' } satisfies Tag;
    if (interactive) {
      const size = Math.ceil((Math.max(R.W, R.H) * 2.6) / 100) * 100;
      const grid = new GridHelper(size, size / 100, cssColor('--line', '#cbd5d1'), cssColor('--grid', '#dde4e1'));
      grid.position.set(R.W / 2, -4, R.H / 2);
      root.add(grid);
    }

    const info = interactive ? analysePlan(L, R, reg) : null;
    const accent = cssColor('--accent', '#1e5eff');
    const warn = cssColor('--warn', '#c2410c');
    // món đang chọn hiện khung xanh, món chồng lấn hoặc chắn cửa hiện khung cam
    const mark = (g: Group, selected: boolean, bad: boolean): void => {
      if (!interactive || (!selected && !bad)) return;
      g.updateMatrixWorld(true);
      const b = new Box3().setFromObject(g).expandByScalar(2);
      const sz = b.getSize(new Vector3());
      const ct = b.getCenter(new Vector3());
      const col = bad ? warn : accent;
      addBox(root, sz.x, sz.y, sz.z, ct.x, ct.y, ct.z, col, { opacity: selected ? 0.28 : 0.22, noEdge: true });
      const hl = new LineSegments(new EdgesGeometry(new BoxGeometry(sz.x, sz.y, sz.z)), new LineBasicMaterial({ color: col }));
      hl.position.copy(ct);
      root.add(hl);
    };

    for (const it of L.items) {
      const g = this.floorItem(it);
      root.add(g);
      const selected = interactive && v.sel?.scope === 'floor' && v.sel.uid === it.uid;
      mark(g, selected, !!info?.bad.has(it.uid));
      if (selected && it.z !== 0 && canEdit(it, 'rotate')) this.rotationHandle(root, it, accent);
    }
    for (const wl of WALL_KEYS) {
      for (const it of L.walls[wl]) {
        const g = this.wallItem(wl, it, R);
        root.add(g);
        mark(g, interactive && v.sel?.scope === wl && v.sel.uid === it.uid, false);
      }
    }

    const paint = new Color(L.wall);
    const walls: Partial<Record<WallKey, Group>> = {};
    for (const wl of WALL_KEYS) {
      const g = new Group();
      if (interactive) g.userData.tg = { t: 'wall', wl } satisfies Tag;
      const cuts = wallCuts(wl, R.W, R.H, covers);
      if (R.rails.includes(wl)) {
        // lan can thay cho tường: không bị làm mờ khi quay camera, nên không nằm trong nhóm tường
        this.railing(root, wl, R, cuts);
        root.add(g);
        walls[wl] = g;
        continue;
      }
      const pieces = wallPieces(R, wl);
      for (const r of clipPieces(pieces.rects, cuts)) {
        const pl = placeWall(wl, R, r, WALL_THICKNESS);
        const m = addBox(g, pl.s[0], pl.s[1], pl.s[2], pl.p[0], pl.p[1], pl.p[2], paint);
        (m.material as Material).transparent = true;
      }
      for (const r of clipPieces(pieces.glass, cuts)) {
        const pl = placeWall(wl, R, r, 2);
        addBox(root, pl.s[0], pl.s[1], pl.s[2], pl.p[0], pl.p[1], pl.p[2], 0xbfd7e3, { opacity: 0.35, noEdge: true });
      }
      root.add(g);
      walls[wl] = g;
    }
    const open = (a: WallKey, b: WallKey): boolean => R.rails.includes(a) && R.rails.includes(b);
    for (const [x, z, a, b] of [
      [-5, -5, 'T', 'L'],
      [R.W + 5, -5, 'T', 'R'],
      [-5, R.H + 5, 'B', 'L'],
      [R.W + 5, R.H + 5, 'B', 'R'],
    ] as const) {
      // trụ góc nằm dưới phòng khác thì bỏ
      if (covers.some((c) => x > c.x && x < c.x + c.w && z > c.y && z < c.y + c.h)) continue;
      // góc giữa hai cạnh lan can chỉ là trụ cao bằng tay vịn
      const h = open(a, b) ? RAIL_TOP : C;
      addBox(root, 10, h, 10, x, h / 2, z, open(a, b) ? RAIL_COLOR : shade(L.wall, 1.0));
    }
    const rig: Rig = { ox: 0, oz: 0, W: R.W, H: R.H, walls, faded: { T: false, R: false, B: false, L: false } };
    this.rigs.push(rig);
    return rig;
  }

  /** Lan can ở một cạnh: tay vịn, thanh giữa và các trụ cách nhau 50 cm. */
  private railing(root: Group, wl: WallKey, R: RoomGeo, cuts: readonly [number, number][] = []): void {
    const len = wallLength(R, wl);
    const bar = (a: number, b: number, lo: number, hi: number, th: number): void => {
      for (const piece of clipPieces([[a, b, lo, hi]], cuts)) {
        const pl = placeWall(wl, R, piece, th);
        addBox(root, pl.s[0], pl.s[1], pl.s[2], pl.p[0], pl.p[1], pl.p[2], RAIL_COLOR);
      }
    };
    bar(0, len, RAIL_TOP - 6, RAIL_TOP, 6);
    bar(0, len, 45, 49, 2);
    for (let s = 0; s < len; s += 50) bar(s - 1.5, s + 1.5, 0, RAIL_TOP - 6, 4);
    bar(len - 1.5, len + 1.5, 0, RAIL_TOP - 6, 4);
  }

  private floorItem(it: FloorItem): Group {
    const g = new Group();
    const reg = this.host.registry;
    shapeFor(reg.resolve(it.id)?.shape)({ g, w: it.w, d: it.d, h: floorHeight(it, reg), color: new Color(it.color) });
    g.position.set(it.x, 0, it.y);
    g.rotation.y = (-it.rot * Math.PI) / 180;
    g.userData.tg = { t: 'item', sel: { scope: 'floor', uid: it.uid } } satisfies Tag;
    return g;
  }

  private wallItem(wl: WallKey, it: WallItem, R: RoomGeo): Group {
    const g = new Group();
    const dep = wallDepth(it, this.host.registry);
    const vert = wl === 'L' || wl === 'R';
    addBox(g, vert ? dep : it.w, it.h, vert ? it.w : dep, 0, 0, 0, new Color(it.color));
    const yc = it.y + it.h / 2;
    const s = it.x;
    const p: [number, number, number] =
      wl === 'T' ? [s, yc, dep / 2] : wl === 'B' ? [R.W - s, yc, R.H - dep / 2] : wl === 'L' ? [dep / 2, yc, R.H - s] : [R.W - dep / 2, yc, s];
    g.position.set(p[0], p[1], p[2]);
    g.userData.tg = { t: 'item', sel: { scope: wl, uid: it.uid } } satisfies Tag;
    return g;
  }

  /** Tay nắm xoay: quả cầu xanh nằm trước món, nhấn giữ rồi kéo quanh món để xoay tự do. */
  private rotationHandle(root: Group, it: FloorItem, col: Color): void {
    const a = (it.rot * Math.PI) / 180;
    const dist = it.d / 2 + 36;
    const hx = it.x + Math.sin(a) * dist;
    const hz = it.y - Math.cos(a) * dist;
    const ball = new Mesh(new SphereGeometry(13, 20, 14), new MeshBasicMaterial({ color: col }));
    ball.position.set(hx, 14, hz);
    ball.userData.tg = { t: 'rot' } satisfies Tag;
    root.add(ball);
    const ring = new Mesh(new TorusGeometry(15, 2.2, 8, 28), new MeshBasicMaterial({ color: 0xffffff }));
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(ball.position);
    root.add(ring);
    root.add(new Line(new BufferGeometry().setFromPoints([new Vector3(it.x, 14, it.y), ball.position.clone()]), new LineBasicMaterial({ color: col })));
  }

  /* ---------- Chọn vật bằng tia ---------- */

  private ray(e: { clientX: number; clientY: number }): Raycaster {
    const rc = this.renderer!.domElement.getBoundingClientRect();
    const m = new Vector2(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
    const ray = new Raycaster();
    ray.setFromCamera(m, this.camera!);
    return ray;
  }

  /** Điểm đầu tiên con trỏ chạm: sàn, tường (không tính tường đang mờ) hoặc một món. */
  private hit(e: { clientX: number; clientY: number }): { tag: Tag; point: Vector3 } | null {
    if (!this.content) return null;
    for (const h of this.ray(e).intersectObjects(this.content.children, true)) {
      const tag = tagOf(h.object);
      if (!tag) continue;
      if (tag.t === 'wall' && this.rigs[0]?.faded[tag.wl]) continue;
      return { tag, point: h.point };
    }
    return null;
  }

  private planeHit(e: { clientX: number; clientY: number }, plane: Plane): Vector3 | null {
    return this.ray(e).ray.intersectPlane(plane, new Vector3());
  }

  private penTarget(e: PointerEvent): PenTarget | null {
    const h = this.hit(e);
    if (!h) return null;
    if (h.tag.t === 'item') return { kind: 'item', sel: h.tag.sel };
    if (h.tag.t === 'floor') return { kind: 'floor' };
    if (h.tag.t === 'wall') return { kind: 'wall' };
    return null;
  }

  /* ---------- Con trỏ ---------- */

  private onDown(e: PointerEvent): void {
    const el = this.renderer!.domElement;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* vẫn dùng được */
    }
    this.ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.pinch = 0;
    this.downAt = { x: e.clientX, y: e.clientY };
    this.idrag = null;
    // xem 3D cả căn hộ chỉ để xem: kéo là xoay cảnh, không chọn hay kéo đồ
    if (this.ptr.size === 1 && !this.host.view().pen && !this.host.view().overview && this.content) this.beginItemDrag(e);
  }

  private onMove(e: PointerEvent): void {
    const p = this.ptr.get(e.pointerId);
    if (!p) return;
    if (this.idrag) {
      p.x = e.clientX;
      p.y = e.clientY;
      this.moveItem(e);
      return;
    }
    if (this.ptr.size === 1) {
      this.yaw -= (e.clientX - p.x) * 0.008;
      this.pitch = clamp(this.pitch + (e.clientY - p.y) * 0.006, 0.05, 1.5);
    }
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.ptr.size === 2) {
      const [a, b] = [...this.ptr.values()];
      const dd = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (this.pinch && dd > 0) this.zoom(this.pinch / dd);
      this.pinch = dd;
    }
  }

  private onUp(e: PointerEvent): void {
    const click = !!this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) < CLICK_SLOP;
    if (e.type === 'pointerup' && this.ptr.size === 1 && click && !this.host.view().overview) {
      if (this.host.view().pen) this.host.pen(this.penTarget(e));
      else if (!this.idrag && this.host.view().sel) this.host.select(null);
    }
    const d = this.idrag;
    this.idrag = null;
    if (d && 'moved' in d && d.moved) this.host.changed();
    this.ptr.delete(e.pointerId);
    this.pinch = 0;
  }

  private beginItemDrag(e: PointerEvent): void {
    const h = this.hit(e);
    const view = this.host.view();
    if (h?.tag.t === 'rot') {
      if (view.sel?.scope === 'floor') {
        this.idrag = { key: 'rot', sel: view.sel, plane: new Plane(new Vector3(0, 1, 0), -14), moved: false };
      }
      return;
    }
    if (!h || h.tag.t !== 'item') return;
    const sel = h.tag.sel;
    this.host.select(sel);
    const it = findItem(this.host.layout(), sel);
    if (!it) return;
    if (!canEdit(it, 'move')) {
      this.idrag = { key: 'locked', told: false };
      return;
    }
    const R = this.host.geo();
    if (sel.scope === 'floor') {
      const plane = new Plane(new Vector3(0, 1, 0), -h.point.y);
      const p0 = this.planeHit(e, plane);
      if (!p0) return;
      this.idrag = { key: 'plan', sel, plane, dx: it.x - p0.x, dy: (it as FloorItem).y - p0.z, moved: false };
    } else {
      const plane = new Plane().setFromNormalAndCoplanarPoint(wallNormal(sel.scope), h.point);
      const p0 = this.planeHit(e, plane);
      if (!p0) return;
      this.idrag = { key: sel.scope, sel, plane, dx: it.x - wallS(sel.scope, p0, R), dy: it.y - p0.y, moved: false };
    }
  }

  private moveItem(e: PointerEvent): void {
    const d = this.idrag;
    if (!d) return;
    if (d.key === 'locked') {
      if (!d.told && this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) >= CLICK_SLOP) {
        d.told = true;
        this.host.notice(t('Món này đã khóa nên không kéo được. Mở khóa ở bảng bên phải nếu muốn di chuyển.'));
      }
      return;
    }
    const it = findItem(this.host.layout(), d.sel);
    const p = this.planeHit(e, d.plane);
    if (!it || !p) return;
    const R = this.host.geo();
    const snap = this.host.view().snap;

    if (d.key === 'rot') {
      const f = it as FloorItem;
      const rot = snapAngle((Math.atan2(p.x - f.x, -(p.z - f.y)) * 180) / Math.PI, e.shiftKey, snap);
      if (rot !== f.rot) {
        f.rot = rot;
        d.moved = true;
        this.host.changing();
      }
      return;
    }
    if (d.key === 'plan') {
      const f = it as FloorItem;
      const b = boxOf(f);
      const hw = b.w / 2;
      const hh = b.h / 2;
      let nx = p.x + d.dx;
      let ny = p.z + d.dy;
      if (snap) {
        nx = Math.round((nx - hw) / LIMITS.grid) * LIMITS.grid + hw;
        ny = Math.round((ny - hh) / LIMITS.grid) * LIMITS.grid + hh;
      }
      nx = clamp(nx, 0, R.W);
      ny = clamp(ny, 0, R.H);
      if (nx !== f.x || ny !== f.y) {
        f.x = nx;
        f.y = ny;
        d.moved = true;
        this.host.changing();
      }
      return;
    }
    const w = it as WallItem;
    const len = wallLength(R, d.key);
    let ex = wallS(d.key, p, R) + d.dx;
    let ey = p.y + d.dy;
    if (snap) {
      ex = Math.round((ex - w.w / 2) / LIMITS.grid) * LIMITS.grid + w.w / 2;
      ey = Math.round(ey / LIMITS.grid) * LIMITS.grid;
    }
    ex = clamp(ex, 0, len);
    ey = clamp(ey, 0, Math.max(0, R.ceil - w.h));
    if (ex !== w.x || ey !== w.y) {
      w.x = ex;
      w.y = ey;
      d.moved = true;
      this.host.changing();
    }
  }

  /* ---------- Thả từ thư viện, bàn phím ---------- */

  private onDrop(e: DragEvent): void {
    e.preventDefault();
    const id = e.dataTransfer?.getData('text/plain');
    if (!id) return;
    if (this.host.view().overview) {
      // 3D cả căn hộ chỉ để xem: chỉ nhận loại phòng (thêm phòng mới), đồ thì phải thả ở mặt bằng
      if (roomTypeFromDragId(id)) this.host.drop(id, null);
      else this.host.notice(t('Muốn thêm đồ, hãy chuyển sang Mặt bằng hoặc zoom vào một phòng.'));
      return;
    }
    const def = this.host.registry.resolve(id);
    // cửa đi, cửa sổ là món nằm trên tường nhưng không có trong danh sách đồ: thả lên tường thì đặt đúng chỗ đó, thả xuống sàn thì vào tường gần nhất
    const isOpening = !!this.host.registry.opening(id);
    if (!def && !isOpening) return;
    const R = this.host.geo();
    const h = this.hit(e);
    let at: DropAt | null = null;
    if (def?.place === 'wall' || (isOpening && h?.tag.t === 'wall')) {
      if (h?.tag.t === 'wall') at = { kind: 'wall', wall: h.tag.wl, s: wallS(h.tag.wl, h.point, R), y: def ? Math.max(0, h.point.y - def.h / 2) : null };
    } else {
      const pt = h?.tag.t === 'floor' ? h.point : this.planeHit(e, new Plane(new Vector3(0, 1, 0), 0));
      if (pt) at = { kind: 'plan', x: pt.x, y: pt.z };
    }
    this.host.drop(id, at);
  }

  private onKey(e: KeyboardEvent): void {
    const k = e.key;
    if (k === 'ArrowLeft') this.yaw += 0.12;
    else if (k === 'ArrowRight') this.yaw -= 0.12;
    else if (k === 'ArrowUp') this.pitch = clamp(this.pitch + 0.08, 0.05, 1.5);
    else if (k === 'ArrowDown') this.pitch = clamp(this.pitch - 0.08, 0.05, 1.5);
    else if (k === '+' || k === '=') this.zoom(0.85);
    else if (k === '-') this.zoom(1.18);
    else if ((k === 'r' || k === 'R') && this.host.view().sel?.scope === 'floor') this.host.rotateBy(e.shiftKey ? -90 : 90);
    else if ((k === 'Delete' || k === 'Backspace') && this.host.view().sel) this.host.removeSelected();
    else return;
    e.preventDefault();
  }
}
