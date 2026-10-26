import { normHex } from '../core/color';
import { escapeHtml, fm } from '../core/format';
import type { Issue } from '../core/validate';
import type { ItemDef } from '../data/schema';
import { n2 } from '../views/svg';
import { PLACE_LABEL, STATUS_LABEL, type GalleryGroup } from './model';
import { t, tn } from '../i18n';

/** Mọi hình trong trang vẽ chung một tỉ lệ (px cho mỗi cm) để so kích thước bằng mắt. */
export const SCALE = { min: 0.3, max: 2, step: 0.1, initial: 0.8 } as const;

/** Chừa quanh món (cm) để nét viền không bị cắt. */
const PAD = 4;
/** Kích thước tối đa khi vẽ (cm). Dữ liệu hỏng (rộng 99999) không làm vỡ trang. */
const DRAW_MAX = 1000;
const FALLBACK_COLOR = '#cccccc';

export interface CardContext {
  scale: number;
  issues: ReadonlyMap<string, readonly Issue[]>;
  /** Tra món theo mã, để ghi tên món thay thế. */
  byId: ReadonlyMap<string, ItemDef>;
  /** Có chỗ cho ảnh 3D (đồ sàn). Ảnh được gắn vào sau khi dựng xong. */
  show3d: boolean;
}

const drawSize = (v: number): number => (Number.isFinite(v) ? Math.min(DRAW_MAX, Math.max(1, v)) : 1);

/**
 * Hình món theo tỉ lệ thật. Đồ sàn: nhìn từ trên (rộng × sâu). Đồ gắn tường: nhìn thẳng vào tường (rộng × cao).
 * Đơn vị bên trong là cm, kích thước hiển thị là cm × scale.
 */
export function figureSvg(def: ItemDef, scale: number): string {
  const w = drawSize(def.w);
  const h = drawSize(def.place === 'wall' ? def.h : def.d);
  const vw = w + PAD * 2;
  const vh = h + PAD * 2;
  const color = normHex(def.color) ?? FALLBACK_COLOR;
  const dash = def.layer === 'under' ? ' stroke-dasharray="6 4"' : '';
  const label = `${tn(def.name)}, ${fm(def.w)} × ${fm(def.place === 'wall' ? def.h : def.d)} cm`;
  return (
    `<svg class="gsvg" viewBox="0 0 ${n2(vw)} ${n2(vh)}" width="${n2(vw * scale)}" height="${n2(vh * scale)}" role="img" aria-label="${escapeHtml(label)}">` +
    `<rect x="${PAD}" y="${PAD}" width="${n2(w)}" height="${n2(h)}" rx="3" style="fill:${color};stroke:var(--ink);stroke-opacity:.6;stroke-width:1.2"${dash}/>` +
    `</svg>`
  );
}

/** Kích thước viết thành chữ, kèm ý nghĩa từng số. */
export function sizeText(def: ItemDef): string {
  if (def.place === 'wall') {
    return t('{w} × {h} cm (rộng × cao), nhô ra {d} cm, mép dưới cách sàn {y} cm', { w: fm(def.w), h: fm(def.h), d: fm(def.d), y: fm(def.y ?? 0) });
  }
  return t('{w} × {d} × {h} cm (rộng × sâu × cao)', { w: fm(def.w), d: fm(def.d), h: fm(def.h) });
}

/** Thanh thước dài đúng 100 cm ở tỉ lệ hiện tại. */
export function rulerHtml(scale: number): string {
  const px = n2(100 * scale);
  return `<span class="gruler" style="width:${px}px" role="img" aria-label="${t('Thước 100 cm')}"></span><span class="mono">100 cm = ${px} px</span>`;
}

function metaRow(label: string, valueHtml: string): string {
  return `<dt>${escapeHtml(label)}</dt><dd>${valueHtml}</dd>`;
}

function metaHtml(def: ItemDef, ctx: CardContext): string {
  const rows: string[] = [];
  rows.push(metaRow(t('Kích thước'), `<span class="mono">${escapeHtml(sizeText(def))}</span>`));
  const hex = normHex(def.color);
  rows.push(metaRow(t('Màu'), `<span class="gsw" style="background:${hex ?? FALLBACK_COLOR}"></span><span class="mono">${escapeHtml(def.color)}</span>`));
  rows.push(metaRow(t('Kiểu vẽ 3D'), `<span class="mono">${escapeHtml(def.shape ?? 'box')}</span>${def.shape ? '' : ` ${escapeHtml(t('(mặc định)'))}`}`));
  if (def.short) rows.push(metaRow(t('Tên ngắn'), escapeHtml(tn(def.short))));
  const flags: string[] = [];
  if (def.layer === 'under') flags.push(t('Trải dưới đồ khác, không tính chồng lấn'));
  if (def.ignoreLane) flags.push(t('Món nhỏ, bỏ qua khi tính lối đi'));
  if (flags.length) rows.push(metaRow(t('Đặc biệt'), escapeHtml(flags.join('. '))));
  if (def.note) rows.push(metaRow(t('Ghi chú'), escapeHtml(tn(def.note))));
  if (def.status === 'retired') {
    const to = def.replacedBy ? ctx.byId.get(def.replacedBy) : undefined;
    const link = to ? `<a href="#item-${escapeHtml(to.id)}">${escapeHtml(tn(to.name))}</a> <span class="mono">(${escapeHtml(to.id)})</span>` : `<span class="gbad">${t('chưa có món thay thế hợp lệ')}</span>`;
    rows.push(metaRow(t('Thay bằng'), link));
  }
  return `<dl class="gmeta">${rows.join('')}</dl>`;
}

/** Danh sách vấn đề. withWhere: ghi thêm mã món hoặc phòng liên quan (dùng ở mục tổng hợp, nơi không có thẻ món bên trên). */
export function issuesHtml(list: readonly Issue[] | undefined, withWhere = false): string {
  if (!list || list.length === 0) return '';
  const lis = list
    .map((is) => {
      const kind = is.level === 'error' ? t('Lỗi') : t('Cảnh báo');
      const where = withWhere ? ` <span class="mono">[${escapeHtml(is.where)}]</span>` : '';
      const field = is.field ? ` <span class="mono">(${escapeHtml(is.field)})</span>` : '';
      return `<li class="${is.level === 'error' ? 'err' : 'warn'}"><b>${kind}:</b>${where} ${escapeHtml(is.message)}${field}</li>`;
    })
    .join('');
  return `<ul class="gissues">${lis}</ul>`;
}

export function cardHtml(def: ItemDef, ctx: CardContext): string {
  const status = tn(STATUS_LABEL[def.status] ?? String(def.status));
  const safeStatus = ['draft', 'live', 'retired'].includes(def.status) ? def.status : 'draft';
  const thumb =
    ctx.show3d && def.place === 'floor'
      ? `<figure class="gfig"><div class="g3d" data-thumb="${escapeHtml(def.id)}" aria-hidden="true"></div><figcaption>${t('3D, không theo tỉ lệ')}</figcaption></figure>`
      : '';
  const caption = def.place === 'wall' ? t('Mặt đứng, theo tỉ lệ') : t('Mặt bằng, theo tỉ lệ');
  return (
    `<article class="gcard" id="item-${escapeHtml(def.id)}" data-status="${safeStatus}">` +
    `<header class="ghead"><div><h3>${escapeHtml(tn(def.name))}</h3><span class="gid mono">${escapeHtml(def.id)} · ${escapeHtml(tn(PLACE_LABEL[def.place] ?? def.place))}</span></div><span class="badge ${safeStatus}">${escapeHtml(status)}</span></header>` +
    `<div class="gfigs"><figure class="gfig">${figureSvg(def, ctx.scale)}<figcaption>${caption}</figcaption></figure>${thumb}</div>` +
    metaHtml(def, ctx) +
    issuesHtml(ctx.issues.get(def.id)) +
    `</article>`
  );
}

export function groupsHtml(groups: readonly GalleryGroup[], ctx: CardContext): string {
  if (groups.length === 0) return `<p class="empty">${t('Không có món nào khớp bộ lọc.')}</p>`;
  return groups
    .map(
      (g) =>
        `<section class="ggroup" aria-label="${escapeHtml(tn(g.cat.name))}">` +
        `<h2>${escapeHtml(tn(g.cat.name))}<span class="gcount">${t('{n} món', { n: g.items.length })}</span></h2>` +
        `<div class="gflow">${g.items.map((it) => cardHtml(it, ctx)).join('')}</div>` +
        `</section>`,
    )
    .join('');
}
