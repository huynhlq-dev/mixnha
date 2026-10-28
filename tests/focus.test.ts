import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLang } from '../src/i18n';
import { FOCUS_MOVES, FocusLayout } from '../src/ui/focus';
import { queryEls } from '../src/ui/els';
import type { LibScope } from '../src/ui/library';

/** Thân trang thật của index.html, để kiểm tra các id và chỗ chứa khớp nhau (gõ sai một id là chế độ tập trung hỏng mà không báo). */
const bodyHtml = (): string => /<body[^>]*>([\s\S]*)<\/body>/.exec(readFileSync('index.html', 'utf8'))![1]!.replace(/<script[\s\S]*?<\/script>/g, '').replace(/%VITE_APP_NAME%/g, 'Mix Nhà');

const mq = (matches: boolean) => {
  const listeners: (() => void)[] = [];
  const list = { matches, addEventListener: (_: string, f: () => void) => listeners.push(f), removeEventListener: () => {} };
  vi.stubGlobal('matchMedia', () => list);
  return {
    set(v: boolean) {
      list.matches = v;
      for (const f of listeners) f();
    },
  };
};

function setup(small = false) {
  document.body.innerHTML = bodyHtml();
  const m = mq(small);
  const scopes: (LibScope | null)[] = [];
  const focus = new FocusLayout({ setScope: (s) => scopes.push(s) });
  const rail = (id: string) => document.querySelector<HTMLElement>(`[data-rail="${id}"]`)!;
  const fly = document.getElementById('fsFly')!;
  return { focus, scopes, rail, fly, m };
}

/** Chỗ của một phần tử trong cây: cha và phần tử liền sau (chỗ cũ phải khôi phục đúng). */
const place = (id: string) => {
  const el = document.getElementById(id)!;
  return { parent: el.parentElement, next: el.nextElementSibling, role: el.getAttribute('role') };
};

beforeEach(() => {
  setLang('vi');
});

afterEach(() => {
  document.body.className = '';
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('chế độ tập trung: khớp với index.html', () => {
  it('mọi phần tử được chuyển và mọi chỗ chứa đều có trong trang, mỗi id một lần', () => {
    document.body.innerHTML = bodyHtml();
    for (const m of FOCUS_MOVES) {
      expect(document.querySelectorAll(`#${m.id}`), m.id).toHaveLength(1);
      expect(document.querySelectorAll(`[data-slot="${m.slot}"]`), m.slot).toHaveLength(1);
    }
  });

  it('queryEls tìm đủ các phần tử mới (dự án, chụp ảnh)', () => {
    document.body.innerHTML = bodyHtml();
    const els = queryEls();
    expect(els.btnProj.getAttribute('aria-controls')).toBe('projMenu');
    expect(els.btnShot.id).toBe('btnShot');
    expect(els.projName.id).toBe('projName');
  });

  it('chưa bật thì thanh trên, thanh trái và bảng đều ẩn (chỉ lớp .focus mới hiện chúng)', () => {
    const { fly, focus } = setup();
    expect(focus.active).toBe(false);
    expect(document.body.classList.contains('focus')).toBe(false);
    expect(fly.hidden).toBe(true);
  });
});

describe('chế độ tập trung: bật và tắt', () => {
  it('bật: lớp focus, các nút nằm vào chỗ mới, vai trò menu được đặt', () => {
    const { focus } = setup();
    focus.setFullscreen(true);
    expect(focus.active).toBe(true);
    expect(document.body.classList.contains('focus')).toBe(true);
    for (const m of FOCUS_MOVES) expect(document.querySelector(`[data-slot="${m.slot}"] > #${m.id}`) ?? document.querySelector(`[data-slot="${m.slot}"] #${m.id}`), m.id).not.toBeNull();
    expect(document.querySelector('#projMenu #btnNew')!.getAttribute('role')).toBe('menuitem');
    // Bố trí mẫu, Xóa hết rời menu "Khác" nên không còn là menuitem
    expect(document.getElementById('btnReset')!.hasAttribute('role')).toBe(false);
    expect(document.querySelector('#fsTop #btnUndo')).not.toBeNull();
  });

  it('tắt: mọi phần tử về đúng chỗ cũ (cha, phần tử liền sau, vai trò) và không sót dấu giữ chỗ', () => {
    document.body.innerHTML = bodyHtml();
    const before = new Map(FOCUS_MOVES.map((m) => [m.id, place(m.id)]));
    const focus = new FocusLayout({ setScope: () => {} });
    focus.setFullscreen(true);
    focus.setFullscreen(false);
    expect(focus.active).toBe(false);
    expect(document.body.classList.contains('focus')).toBe(false);
    for (const m of FOCUS_MOVES) {
      const now = place(m.id);
      const was = before.get(m.id)!;
      expect(now.parent, m.id).toBe(was.parent);
      expect(now.next, m.id).toBe(was.next);
      expect(now.role, m.id).toBe(was.role);
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
    let comments = 0;
    while (walker.nextNode()) if (/^focus:/.test(walker.currentNode.nodeValue ?? '')) comments++;
    expect(comments).toBe(0);
  });

  it('bật rồi tắt nhiều lần vẫn về đúng chỗ', () => {
    document.body.innerHTML = bodyHtml();
    const before = new Map(FOCUS_MOVES.map((m) => [m.id, place(m.id)]));
    const focus = new FocusLayout({ setScope: () => {} });
    for (let i = 0; i < 3; i++) {
      focus.setFullscreen(true);
      focus.setFullscreen(false);
    }
    for (const m of FOCUS_MOVES) expect(place(m.id).parent, m.id).toBe(before.get(m.id)!.parent);
  });

  it('màn hình nhỏ (điện thoại): toàn màn hình không vào chế độ tập trung, không chuyển gì', () => {
    const { focus } = setup(true);
    focus.setFullscreen(true);
    expect(focus.active).toBe(false);
    expect(document.body.classList.contains('focus')).toBe(false);
    expect(document.querySelector('.acts #btnUndo')).not.toBeNull();
  });

  it('đổi cỡ cửa sổ giữa chừng: thu nhỏ thì rời chế độ tập trung, phóng lại thì vào lại', () => {
    const { focus, m } = setup();
    focus.setFullscreen(true);
    expect(focus.active).toBe(true);
    m.set(true);
    expect(focus.active).toBe(false);
    expect(document.querySelector('.acts #btnUndo')).not.toBeNull();
    m.set(false);
    expect(focus.active).toBe(true);
    expect(document.querySelector('#fsTop #btnUndo')).not.toBeNull();
  });

  it('nút đang có focus vẫn giữ focus sau khi bị chuyển chỗ', () => {
    const { focus } = setup();
    const full = document.getElementById('btnFull')!;
    full.focus();
    focus.setFullscreen(true);
    expect(document.activeElement).toBe(full);
    focus.setFullscreen(false);
    expect(document.activeElement).toBe(full);
  });

  it('dispose khi đang bật: trả mọi thứ về chỗ cũ', () => {
    const { focus } = setup();
    focus.setFullscreen(true);
    focus.dispose();
    expect(document.body.classList.contains('focus')).toBe(false);
    expect(document.querySelector('.acts #btnUndo')).not.toBeNull();
  });
});

describe('chế độ tập trung: bảng ở thanh trái', () => {
  it('bấm nút Nội thất mở bảng thư viện lọc theo đồ nội thất; bấm lại thì đóng', () => {
    const { focus, rail, fly, scopes } = setup();
    focus.setFullscreen(true);
    rail('furniture').click();
    expect(fly.hidden).toBe(false);
    expect(focus.panel).toBe('furniture');
    expect(scopes.at(-1)).toBe('furniture');
    expect(document.getElementById('editor')!.hasAttribute('data-fly')).toBe(true);
    expect(rail('furniture').getAttribute('aria-expanded')).toBe('true');
    expect(rail('room').getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('fsFlyTitle')!.textContent).toBe('Nội thất');
    expect((fly.querySelector('[data-panel="lib"]') as HTMLElement).hidden).toBe(false);
    expect((fly.querySelector('[data-panel="room"]') as HTMLElement).hidden).toBe(true);
    rail('furniture').click();
    expect(fly.hidden).toBe(true);
    expect(focus.panel).toBeNull();
    expect(document.getElementById('editor')!.hasAttribute('data-fly')).toBe(false);
    expect(rail('furniture').getAttribute('aria-expanded')).toBe('false');
  });

  it('chuyển thẳng từ bảng này sang bảng khác, mỗi bảng đúng nội dung và phạm vi', () => {
    const { focus, rail, fly, scopes } = setup();
    focus.setFullscreen(true);
    rail('furniture').click();
    rail('openings').click();
    expect(scopes.at(-1)).toBe('openings');
    expect(document.getElementById('fsFlyTitle')!.textContent).toBe('Cửa & cửa sổ');
    rail('room').click();
    expect((fly.querySelector('[data-panel="room"]') as HTMLElement).hidden).toBe(false);
    expect((fly.querySelector('[data-panel="lib"]') as HTMLElement).hidden).toBe(true);
    rail('health').click();
    expect((fly.querySelector('[data-panel="health"]') as HTMLElement).hidden).toBe(false);
    rail('settings').click();
    expect((fly.querySelector('[data-panel="settings"]') as HTMLElement).hidden).toBe(false);
    expect(fly.querySelectorAll('[data-panel]:not([hidden])')).toHaveLength(1);
  });

  it('"Thêm phòng vào căn hộ" mở thư viện lọc theo phòng, nút Phòng vẫn sáng; bấm nút Phòng quay về bảng Phòng', () => {
    const { focus, rail, scopes } = setup();
    focus.setFullscreen(true);
    rail('room').click();
    document.getElementById('btnAddRoom')!.click();
    expect(focus.panel).toBe('rooms');
    expect(scopes.at(-1)).toBe('rooms');
    expect(rail('room').getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById('fsFlyTitle')!.textContent).toBe('Thêm phòng vào căn hộ');
    rail('room').click();
    expect(focus.panel).toBe('room');
    expect(document.getElementById('fsFly')!.hidden).toBe(false);
  });

  it('close trả true nếu có bảng để đóng, false nếu không (phím Esc dựa vào đây)', () => {
    const { focus } = setup();
    focus.setFullscreen(true);
    expect(focus.close()).toBe(false);
    focus.open('health');
    expect(focus.close()).toBe(true);
    expect(focus.close()).toBe(false);
  });

  it('nút × đóng bảng', () => {
    const { focus, fly } = setup();
    focus.setFullscreen(true);
    focus.open('settings');
    document.getElementById('fsFlyClose')!.click();
    expect(fly.hidden).toBe(true);
  });

  it('chưa bật chế độ tập trung thì open không làm gì', () => {
    const { focus, fly, scopes } = setup();
    focus.open('furniture');
    expect(fly.hidden).toBe(true);
    expect(scopes).toEqual([]);
  });

  it('tắt chế độ tập trung: đóng bảng và bỏ lọc thư viện (về đủ nhóm như bố cục thường)', () => {
    const { focus, fly, scopes } = setup();
    focus.setFullscreen(true);
    focus.open('openings');
    focus.setFullscreen(false);
    expect(fly.hidden).toBe(true);
    expect(scopes.at(-1)).toBeNull();
    expect(document.getElementById('editor')!.hasAttribute('data-fly')).toBe(false);
  });

  it('menu dự án đang mở được đóng khi thoát', () => {
    const { focus } = setup();
    focus.setFullscreen(true);
    const menu = document.getElementById('projMenu')!;
    menu.hidden = false;
    focus.setFullscreen(false);
    expect(menu.hidden).toBe(true);
  });

  it('đổi ngôn ngữ: tiêu đề bảng đang mở đổi theo', () => {
    const { focus } = setup();
    focus.setFullscreen(true);
    focus.open('rooms');
    expect(document.getElementById('fsFlyTitle')!.textContent).toBe('Thêm phòng vào căn hộ');
    setLang('en');
    focus.languageChanged();
    expect(document.getElementById('fsFlyTitle')!.textContent).toBe('Add a room to the apartment');
  });
});
