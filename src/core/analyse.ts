import type { WallKey } from '../data/schema';
import { boxOf, doorGeom, polyOf, polyOfRect, rectsHit, satHit, wallRect, wallLength, type Box } from './geometry';
import { openingsOn, type Opening, type RoomGeo } from './room';
import type { Registry } from './registry';
import type { FloorItem, Layout } from './types';

/** Khoảng hẹp nhất giữa hai món (lối đi), nếu có. */
export interface LaneGap {
  dist: number;
  /** true: đo theo chiều ngang. */
  horizontal: boolean;
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
  x?: number;
  y?: number;
  a: string;
  b: string;
}

export interface PlanAnalysis {
  /** Món đang chồng lấn, nằm ngoài phòng hoặc chắn vùng mở cửa. */
  bad: Set<number>;
  gap: LaneGap | null;
  /** Phần trăm diện tích sàn bị đồ chiếm. */
  pct: number;
}

/** Lối đi tối thiểu nên chừa (cm). */
export const MIN_LANE = 60;

export function analysePlan(layout: Layout, R: RoomGeo, reg: Registry): PlanAnalysis {
  const bad = new Set<number>();
  let used = 0;
  const zones = R.doors.map((d) => polyOfRect(doorGeom(R, d).zone));
  const list = layout.items.filter((i) => i.z > 0);

  for (const it of list) {
    const b = boxOf(it);
    const pa = polyOf(it);
    used += it.w * it.d;
    let isBad = b.x0 < -0.5 || b.y0 < -0.5 || b.x1 > R.W + 0.5 || b.y1 > R.H + 0.5;
    if (!isBad) isBad = zones.some((z) => satHit(pa, z));
    if (!isBad) isBad = list.some((o) => o !== it && satHit(pa, polyOf(o)));
    if (isBad) bad.add(it.uid);
  }

  const pass = list.filter((i) => !reg.resolve(i.id)?.ignoreLane);
  let gap: LaneGap | null = null;
  for (let i = 0; i < pass.length; i++) {
    for (let j = i + 1; j < pass.length; j++) {
      const A = pass[i]!;
      const B = pass[j]!;
      const a = boxOf(A);
      const b = boxOf(B);
      const yo = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      const xo = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const cands: LaneGap[] = [];
      if (yo > 0) {
        const g = Math.max(a.x0 - b.x1, b.x0 - a.x1);
        if (g >= 10 && g <= 200) {
          const lx = a.x0 > b.x1 ? b.x1 : a.x1;
          const my = (Math.max(a.y0, b.y0) + Math.min(a.y1, b.y1)) / 2;
          cands.push({ dist: g, horizontal: true, x0: lx, x1: lx + g, y: my, a: A.name, b: B.name });
        }
      }
      if (xo > 0) {
        const g = Math.max(a.y0 - b.y1, b.y0 - a.y1);
        if (g >= 10 && g <= 200) {
          const ty = a.y0 > b.y1 ? b.y1 : a.y1;
          const mx = (Math.max(a.x0, b.x0) + Math.min(a.x1, b.x1)) / 2;
          cands.push({ dist: g, horizontal: false, y0: ty, y1: ty + g, x: mx, a: A.name, b: B.name });
        }
      }
      for (const c of cands) if (!gap || c.dist < gap.dist) gap = c;
    }
  }
  return { bad, gap, pct: Math.round((used / (R.W * R.H)) * 100) };
}

export interface WallAnalysis {
  bad: Set<number>;
  openings: Opening[];
}

export function analyseWall(layout: Layout, R: RoomGeo, wall: WallKey): WallAnalysis {
  const len = wallLength(R, wall);
  const list = layout.walls[wall];
  const openings = openingsOn(R, wall);
  const bad = new Set<number>();
  for (const it of list) {
    const r = wallRect(it);
    let b = r.x0 < -0.5 || r.x1 > len + 0.5 || r.y0 < -0.5 || r.y1 > R.ceil + 0.5;
    if (!b) b = openings.some((p) => rectsHit(r, p));
    if (!b) b = list.some((o) => o !== it && rectsHit(r, wallRect(o)));
    if (b) bad.add(it.uid);
  }
  return { bad, openings };
}

/** Khung bao của món sàn, tiện cho các nơi vẽ. */
export function boxOfFloorItem(it: FloorItem): Box {
  return boxOf(it);
}
