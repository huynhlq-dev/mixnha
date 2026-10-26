import { t, tn } from '../i18n';
import { fm } from './format';
import { analysePlan, MIN_LANE, overlappingOpenings } from './analyse';
import type { Registry } from './registry';
import type { RoomGeo } from './room';
import type { Layout } from './types';

/** ok: đạt (xanh). warn: nên xem lại (vàng). bad: lỗi cần sửa (cam). */
export type HealthLevel = 'ok' | 'warn' | 'bad';

export interface HealthCheck {
  id: 'overlap' | 'doors' | 'lane';
  level: HealthLevel;
  text: string;
}

/**
 * Kiểm tra thiết kế một phòng: ba việc người dùng hay phải tự nhìn bằng mắt. Không cho điểm số: mỗi mục đạt hoặc không, kèm lý do.
 * 1) món chồng nhau hoặc nằm ngoài phòng, 2) cửa bị chắn (món chắn vùng mở cửa, hoặc hai cửa chồng nhau), 3) lối đi giữa các món.
 */
export function designHealth(layout: Layout, R: RoomGeo, reg: Registry): HealthCheck[] {
  const a = analysePlan(layout, R, reg);
  const overlapN = [...a.bad].filter((uid) => !a.blocking.has(uid)).length;
  const blockN = a.blocking.size;
  const openingsClash = overlappingOpenings(R).size;
  const checks: HealthCheck[] = [];

  checks.push(
    overlapN > 0
      ? { id: 'overlap', level: 'bad', text: t('{n} món chồng lấn hoặc nằm ngoài phòng', { n: overlapN }) }
      : { id: 'overlap', level: 'ok', text: t('Không có món chồng lấn hay ra ngoài phòng') },
  );

  if (blockN > 0) checks.push({ id: 'doors', level: 'bad', text: t('{n} món đang chắn vùng mở cửa', { n: blockN }) });
  else if (openingsClash > 0) checks.push({ id: 'doors', level: 'bad', text: t('Cửa đi hoặc cửa sổ đang chồng lên nhau') });
  else checks.push({ id: 'doors', level: 'ok', text: t('Cửa đi, cửa sổ thông thoáng') });

  if (a.gap && a.gap.dist < MIN_LANE) {
    checks.push({ id: 'lane', level: 'warn', text: t('Lối đi giữa {a} và {b} chỉ rộng {dist} cm (nên từ {min} cm)', { a: tn(a.gap.a), b: tn(a.gap.b), dist: fm(a.gap.dist), min: MIN_LANE }) });
  } else if (a.gap) {
    checks.push({ id: 'lane', level: 'ok', text: t('Lối đi hẹp nhất {dist} cm, đủ rộng', { dist: fm(a.gap.dist) }) });
  } else {
    checks.push({ id: 'lane', level: 'ok', text: t('Lối đi thoáng') });
  }
  return checks;
}

/** Mức chung của một danh sách kiểm tra: lỗi nặng nhất. */
export function healthLevel(checks: readonly HealthCheck[]): HealthLevel {
  return checks.some((c) => c.level === 'bad') ? 'bad' : checks.some((c) => c.level === 'warn') ? 'warn' : 'ok';
}
