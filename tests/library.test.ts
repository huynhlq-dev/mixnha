import { describe, expect, it, vi } from 'vitest';
import { registry } from '../src/core/registry';
import { ROOM_TYPE_IDS, ROOMS } from '../src/data/rooms';
import { Library, libraryGroups, libraryHtml, libraryHint } from '../src/ui/library';

const ids = (html: string) => [...html.matchAll(/class="item"[^>]*data-id="([^"]+)"/g)].map((m) => m[1]!);

describe('nhóm trong thư viện theo kiểu xem', () => {
  it('mặt bằng chỉ có đồ sàn, mặt đứng chỉ có đồ tường, 3D có cả hai với tên nhóm riêng cho đồ tường', () => {
    const plan = libraryGroups(registry, 'plan', '');
    const elev = libraryGroups(registry, 'elev', '');
    const all = libraryGroups(registry, '3d', '');
    const tail = ['open-door', 'open-win', 'rooms'];
    expect(plan.map((g) => g.id)).toEqual(['sleeping', 'living', 'dining', 'work', 'bathroom', 'balcony', ...tail]);
    expect(elev.map((g) => g.id)).toEqual(['wall-kitchen', 'wall-hang', 'wall-tall', ...tail]);
    expect(all.map((g) => g.id)).toEqual(['sleeping', 'living', 'dining', 'work', 'bathroom', 'balcony', 'wall-kitchen', 'wall-hang', 'wall-tall', ...tail]);
    expect(all.find((g) => g.id === 'wall-hang')!.title).toBe('Gắn tường: treo');
    expect(elev.find((g) => g.id === 'wall-hang')!.title).toBe('Treo tường');
  });

  it('tìm kiếm không phân biệt dấu, chỉ giữ nhóm còn món khớp', () => {
    const g = libraryGroups(registry, 'plan', 'giuong');
    expect(g.map((x) => x.id)).toEqual(['sleeping']);
    expect(g[0]!.items.map((i) => i.id)).toContain('bed2');
    expect(libraryGroups(registry, 'plan', 'zzzz')).toEqual([]);
    // tên nhóm cũng được tìm
    // "vệ sinh" khớp nhóm đồ vệ sinh, "Cửa vệ sinh" và loại phòng "Phòng vệ sinh"
    expect(libraryGroups(registry, 'plan', 've sinh').map((x) => x.id)).toEqual(['bathroom', 'open-door', 'rooms']);
  });
});

describe('gợi ý dưới danh sách', () => {
  it('chưa tìm kiếm thì nhắc chọn nhóm trước; đang tìm kiếm thì chỉ nói cách thêm món', () => {
    expect(libraryHint('plan')).toBe('Chọn một nhóm, rồi bấm hoặc kéo một món vào bản vẽ.');
    expect(libraryHint('plan', true)).toBe('Bấm hoặc kéo một món vào bản vẽ.');
    expect(libraryHint('elev')).toContain('Chọn một nhóm, rồi bấm hoặc kéo một món lên bức tường');
    expect(libraryHint('3d', true).startsWith('Bấm để thả vào phòng')).toBe(true);
  });
});

describe('danh sách dạng chọn nhóm', () => {
  const groups = libraryGroups(registry, 'plan', '');

  it('mặc định mọi nhóm đóng: chỉ có tiêu đề kèm số món, chưa có món nào', () => {
    const html = libraryHtml(groups);
    expect((html.match(/class="cathead"/g) ?? []).length).toBe(groups.length);
    expect(html).not.toContain('class="item"');
    expect(html.match(/aria-expanded="true"/g)).toBeNull();
    for (const g of groups) expect(html).toContain(`<span class="cn">${g.items.length}</span>`);
  });

  it('nhóm đang chọn hiện đúng món của nó, các nhóm khác vẫn đóng', () => {
    const living = groups.find((g) => g.id === 'living')!;
    const html = libraryHtml(groups, 'living');
    expect(ids(html)).toEqual(living.items.map((i) => i.id));
    expect((html.match(/aria-expanded="true"/g) ?? []).length).toBe(1);
    expect(html).toContain('data-cat="living" aria-expanded="true" aria-controls="lib-living"');
    expect(html).toContain('data-cat="sleeping" aria-expanded="false"');
  });

  it('đang tìm kiếm thì hiện món của mọi nhóm khớp, không có hàng tiêu đề bấm được', () => {
    const found = libraryGroups(registry, 'plan', 'ban');
    expect(found.length).toBeGreaterThan(1);
    const html = libraryHtml(found, null, true);
    expect(html).not.toContain('class="cathead"');
    expect(ids(html)).toEqual(found.flatMap((g) => g.items.map((i) => i.id)));
  });

  it('không có món khớp thì báo, không có tiêu đề', () => {
    expect(libraryHtml([], 'living')).toContain('Không có món nào khớp.');
  });

  it('tên nhóm và món được thoát ký tự HTML', () => {
    const html = libraryHtml([{ id: 'a"b', title: '<i>x</i>', items: [{ ...groups[0]!.items[0]!, id: 'q"1', name: '<b>m</b>' }] }], 'a"b');
    expect(html).not.toContain('<i>x</i>');
    expect(html).not.toContain('<b>m</b>');
    expect(html).toContain('&lt;i&gt;x&lt;/i&gt;');
  });
});

describe('thư viện: chọn nhóm để mở danh sách', () => {
  const make = () => {
    const els = { library: document.createElement('div'), q: document.createElement('input'), libHint: document.createElement('p') };
    const onPick = vi.fn();
    const lib = new Library(els, registry, onPick);
    lib.setMode('plan');
    const head = (id: string) => [...els.library.querySelectorAll<HTMLElement>('.cathead')].find((h) => h.dataset.cat === id)!;
    const shown = () => els.library.querySelectorAll('.item').length;
    return { els, lib, onPick, head, shown };
  };

  it('lúc đầu chưa hiện món nào; chọn nhóm thì hiện danh sách của nhóm đó', () => {
    const { head, shown, els } = make();
    expect(shown()).toBe(0);
    head('sleeping').click();
    expect(head('sleeping').getAttribute('aria-expanded')).toBe('true');
    expect(shown()).toBe(libraryGroups(registry, 'plan', '').find((g) => g.id === 'sleeping')!.items.length);
    expect(els.libHint.textContent).toBe(libraryHint('plan'));
  });

  it('chọn nhóm khác thì nhóm cũ đóng lại; chọn lại nhóm đang mở thì đóng', () => {
    const { head, els } = make();
    head('sleeping').click();
    head('living').click();
    expect(head('sleeping').getAttribute('aria-expanded')).toBe('false');
    expect(head('living').getAttribute('aria-expanded')).toBe('true');
    expect(els.library.querySelectorAll('.cat[data-open="true"]').length).toBe(1);
    head('living').click();
    expect(els.library.querySelectorAll('.item').length).toBe(0);
  });

  it('bấm một món gọi onPick với mã món; bấm tiêu đề thì không', () => {
    const { head, els, onPick } = make();
    head('sleeping').click();
    expect(onPick).not.toHaveBeenCalled();
    els.library.querySelector<HTMLElement>('.item[data-id="bed2"]')!.click();
    expect(onPick).toHaveBeenCalledExactlyOnceWith('bed2');
  });

  it('gõ tìm kiếm thì hiện món khớp ở mọi nhóm; xóa ô tìm kiếm thì về đúng nhóm đã chọn', () => {
    const { head, els, shown } = make();
    head('living').click();
    els.q.value = 'giuong';
    els.q.dispatchEvent(new Event('input'));
    expect(els.library.querySelector('.cathead')).toBeNull();
    expect(els.library.querySelector('.item[data-id="bed2"]')).not.toBeNull();
    expect(els.libHint.textContent).toBe(libraryHint('plan', true));
    els.q.value = '';
    els.q.dispatchEvent(new Event('input'));
    expect(head('living').getAttribute('aria-expanded')).toBe('true');
    expect(shown()).toBe(libraryGroups(registry, 'plan', '').find((g) => g.id === 'living')!.items.length);
  });

  it('đổi kiểu xem: ô tìm kiếm được xóa, nhóm không có ở kiểu mới thì không mở nhóm nào', () => {
    const { head, els, lib, shown } = make();
    head('sleeping').click();
    lib.setMode('elev');
    expect(els.q.value).toBe('');
    expect(els.library.querySelectorAll('.cathead').length).toBe(6);
    expect(shown()).toBe(0);
    lib.setMode('plan');
    expect(head('sleeping').getAttribute('aria-expanded')).toBe('true');
    expect(els.libHint.textContent).toBe(libraryHint('plan'));
  });
});

describe('nhóm cửa đi và cửa sổ trong thư viện', () => {
  it('có ở mọi kiểu xem, đứng cuối, đúng loại và có kích thước', () => {
    for (const mode of ['plan', 'elev', '3d'] as const) {
      const g = libraryGroups(registry, mode, '');
      const [door, win] = g.slice(-3, -1);
      expect(door!.id).toBe('open-door');
      expect(door!.title).toBe('Cửa đi');
      expect(door!.items.map((i) => i.id)).toEqual(registry.openings.filter((p) => p.kind === 'door').map((p) => p.id));
      expect(win!.id).toBe('open-win');
      expect(win!.items.map((i) => i.id)).toEqual(registry.openings.filter((p) => p.kind === 'win').map((p) => p.id));
    }
    const g = libraryGroups(registry, 'plan', '');
    expect(g.find((x) => x.id === 'open-door')!.items.find((i) => i.id === 'door80')).toMatchObject({ name: 'Cửa đi', size: '80 cm' });
    expect(g.find((x) => x.id === 'open-win')!.items.find((i) => i.id === 'win180')).toMatchObject({ name: 'Cửa sổ lớn', size: '180 × 120 cm' });
  });

  it('tìm kiếm tìm được cửa theo tên (không dấu) và theo tên nhóm', () => {
    expect(libraryGroups(registry, 'plan', 'cua so').map((g) => g.id)).toEqual(['open-win']);
    expect(libraryGroups(registry, 'plan', 'kinh').flatMap((g) => g.items.map((i) => i.id))).toEqual(['win200', 'bal180', 'bal240']);
    expect(libraryGroups(registry, 'plan', 'cua di').map((g) => g.id)).toContain('open-door');
  });

  it('bấm một loại cửa gọi onPick với mã cửa; mở nhóm Cửa sổ thấy đủ các loại', () => {
    const els = { library: document.createElement('div'), q: document.createElement('input'), libHint: document.createElement('p') };
    const onPick = vi.fn();
    new Library(els, registry, onPick).setMode('plan');
    els.library.querySelector<HTMLElement>('.cathead[data-cat="open-win"]')!.click();
    expect(els.library.querySelectorAll('.item').length).toBe(registry.openings.filter((p) => p.kind === 'win').length);
    els.library.querySelector<HTMLElement>('.item[data-id="win120"]')!.click();
    expect(onPick).toHaveBeenCalledExactlyOnceWith('win120');
    expect(els.library.querySelector('.item[data-id="win120"]')!.getAttribute('draggable')).toBe('true');
  });
});

describe('nhóm Phòng trong thư viện', () => {
  type M = 'plan' | 'elev' | '3d' | 'apartment' | 'apartment3d';
  const rooms = (mode: M) => libraryGroups(registry, mode, '').find((g) => g.id === 'rooms');

  it('mọi kiểu xem đều có đủ các loại phòng; mã kéo thả là room:<loại>', () => {
    for (const mode of ['plan', 'elev', '3d', 'apartment', 'apartment3d'] as const) {
      expect(rooms(mode)!.items.map((i) => i.id)).toEqual(ROOM_TYPE_IDS.map((t) => `room:${t}`));
    }
    expect(rooms('plan')!.items.find((i) => i.id === 'room:ngu')).toMatchObject({ name: 'Phòng ngủ', size: `${ROOMS.ngu.W} × ${ROOMS.ngu.H} cm` });
    expect(rooms('plan')!.items.find((i) => i.id === 'room:lamviec')!.name).toBe('Phòng làm việc');
  });

  it('mặt bằng cả căn hộ có cùng danh sách với mặt bằng một phòng (đồ sàn, cửa, phòng); 3D cả căn chỉ có nhóm Phòng', () => {
    expect(libraryGroups(registry, 'apartment', '')).toEqual(libraryGroups(registry, 'plan', ''));
    expect(libraryGroups(registry, 'apartment', '').map((g) => g.id)).toEqual(['sleeping', 'living', 'dining', 'work', 'bathroom', 'balcony', 'open-door', 'open-win', 'rooms']);
    expect(libraryGroups(registry, 'apartment3d', '').map((g) => g.id)).toEqual(['rooms']);
    expect(rooms('apartment3d')!.title).toBe('Phòng');
    expect(libraryGroups(registry, 'plan', '').at(-1)!.id).toBe('rooms');
    expect(rooms('plan')!.title).toBe('Phòng (thêm vào căn hộ)');
  });

  it('tìm kiếm tìm được loại phòng theo tên không dấu, kể cả ở xem cả căn', () => {
    expect(libraryGroups(registry, 'apartment3d', 'lam viec').flatMap((g) => g.items.map((i) => i.id))).toEqual(['room:lamviec']);
    expect(libraryGroups(registry, 'apartment3d', 'zzz')).toEqual([]);
    expect(libraryGroups(registry, 'plan', 'phong ngu').find((g) => g.id === 'rooms')!.items.map((i) => i.id)).toEqual(['room:ngu']);
    // ở mặt bằng cả căn tìm "giuong" thấy giường như ở mặt bằng một phòng
    expect(libraryGroups(registry, 'apartment', 'giuong').map((g) => g.id)).toEqual(['sleeping']);
  });

  it('gợi ý: mặt bằng cả căn nói về thả đồ vào phòng; 3D cả căn nói về thêm phòng', () => {
    expect(libraryHint('apartment')).toContain('thả vào phòng');
    expect(libraryHint('apartment3d')).toContain('loại phòng');
    expect(libraryHint('apartment')).not.toBe(libraryHint('plan'));
    expect(libraryHint('apartment3d')).not.toBe(libraryHint('apartment'));
  });

  it('xem 3D cả căn: nhóm Phòng mở sẵn, bấm một loại gọi onPick; rời đó thì không nhóm nào mở sẵn, và lần sau lại mở sẵn', () => {
    const els = { library: document.createElement('div'), q: document.createElement('input'), libHint: document.createElement('p') };
    const onPick = vi.fn();
    const lib = new Library(els, registry, onPick);
    lib.setMode('apartment3d');
    expect(els.library.querySelectorAll('.item').length).toBe(ROOM_TYPE_IDS.length);
    els.library.querySelector<HTMLElement>('.item[data-id="room:bep"]')!.click();
    expect(onPick).toHaveBeenCalledExactlyOnceWith('room:bep');
    lib.setMode('apartment');
    expect(els.library.querySelectorAll('.item').length).toBe(0);
    expect(els.library.querySelector('.cathead[data-cat="rooms"]')!.getAttribute('aria-expanded')).toBe('false');
    lib.setMode('apartment3d');
    els.library.querySelector<HTMLElement>('.cathead[data-cat="rooms"]')!.click();
    expect(els.library.querySelectorAll('.item').length).toBe(0);
    lib.setMode('apartment');
    lib.setMode('apartment3d');
    expect(els.library.querySelectorAll('.item').length).toBe(ROOM_TYPE_IDS.length);
  });

  it('đi từ mặt bằng cả căn vào một phòng: nhóm đang mở được giữ (cùng danh sách)', () => {
    const els = { library: document.createElement('div'), q: document.createElement('input'), libHint: document.createElement('p') };
    const lib = new Library(els, registry, vi.fn());
    lib.setMode('apartment');
    els.library.querySelector<HTMLElement>('.cathead[data-cat="living"]')!.click();
    lib.setMode('plan');
    expect(els.library.querySelector('.cathead[data-cat="living"]')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('các món kéo được', () => {
    const html = libraryHtml(libraryGroups(registry, 'apartment3d', ''), 'rooms');
    expect(html).toContain('draggable="true"');
    expect(html).toContain('data-id="room:ngu"');
  });
});
