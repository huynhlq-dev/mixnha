/**
 * Mọi phần tử trong index.html mà code cần dùng, tìm một lần ở đây. Thiếu phần tử nào thì báo ngay tên phần tử đó,
 * thay vì để lỗi "null" lẻ tẻ xuất hiện sau khi người dùng bấm. Đổi id trong index.html thì chỉ sửa file này.
 */

function find<T extends Element>(root: ParentNode, id: string, ctor: { new (): T }): T {
  const el = root.querySelector(`#${id}`);
  if (!el) throw new Error(`index.html thiếu phần tử #${id}`);
  if (!(el instanceof ctor)) throw new Error(`#${id} phải là ${ctor.name}`);
  return el;
}

export function queryEls(root: ParentNode = document) {
  const btn = (id: string) => find(root, id, HTMLButtonElement);
  const inp = (id: string) => find(root, id, HTMLInputElement);
  const div = (id: string) => find(root, id, HTMLElement);
  return {
    remind: div('remind'),
    remindText: div('remindText'),
    remindExport: btn('remindExport'),
    remindLater: btn('remindLater'),

    editor: div('editor'),
    rooms: div('rooms'),
    btnExport: btn('btnExport'),
    btnImport: btn('btnImport'),
    btnUndo: btn('btnUndo'),
    btnRedo: btn('btnRedo'),
    btnSnap: btn('btnSnap'),
    btnDim: btn('btnDim'),
    btnReset: btn('btnReset'),
    btnClear: btn('btnClear'),

    modes: div('modes'),
    wallsRow: div('wallsRow'),
    walls: div('walls'),
    mini: find(root, 'mini', SVGSVGElement),

    lib: div('lib'),
    libClose: btn('libClose'),
    q: inp('q'),
    library: div('library'),
    libHint: div('libHint'),

    roomName: div('roomName'),
    roomSize: div('roomSize'),
    roomArea: div('roomArea'),
    zoombar: div('zoombar'),
    zOut: btn('zOut'),
    zFit: btn('zFit'),
    zIn: btn('zIn'),
    plan: find(root, 'plan', SVGSVGElement),
    view3d: div('view3d'),
    btnAuto: btn('btnAuto'),
    btnIso: btn('btnIso'),
    btnTop: btn('btnTop'),
    btnZi: btn('btnZi'),
    btnZo: btn('btnZo'),
    btnFull: btn('btnFull'),
    v3hint: div('v3hint'),
    status: div('status'),
    legend: div('legend'),

    penColor: inp('penColor'),
    penHex: inp('penHex'),
    penPick: btn('penPick'),
    penPaint: btn('penPaint'),
    penRecent: div('penRecent'),
    penHint: div('penHint'),

    rW: inp('rW'),
    rH: inp('rH'),
    rC: inp('rC'),
    floorSw: div('floorSw'),
    wallSw: div('wallSw'),

    selEmpty: div('selEmpty'),
    selBox: div('selBox'),
    selName: div('selName'),
    selCustom: div('selCustom'),
    selNote: div('selNote'),
    lblSize: div('lblSize'),
    selW: inp('selW'),
    selD: inp('selD'),
    fieldY: div('fieldY'),
    selY: inp('selY'),
    itemSw: div('itemSw'),
    fieldRot: div('fieldRot'),
    btnRotL: btn('btnRotL'),
    btnRotR: btn('btnRotR'),
    rotKnob: btn('rotKnob'),
    knobDial: div('knobDial'),
    selRot: inp('selRot'),
    btnLock: btn('btnLock'),
    btnDup: btn('btnDup'),
    btnDel: btn('btnDel'),
    lockHint: div('lockHint'),

    mbar: div('mbar'),
    mAdd: btn('mAdd'),
    mRotL: btn('mRotL'),
    mRotR: btn('mRotR'),
    mDup: btn('mDup'),
    mDel: btn('mDel'),

    toast: div('toast'),

    dlgExport: find(root, 'dlgExport', HTMLDialogElement),
    exName: inp('exName'),
    exNote: inp('exNote'),
    exScopeAll: div('exScopeAll'),
    exScopeRoom: div('exScopeRoom'),
    exSummary: div('exSummary'),
    exDone: div('exDone'),
    exDownload: btn('exDownload'),
    exCopy: btn('exCopy'),
    exClose: btn('exClose'),

    dlgImport: find(root, 'dlgImport', HTMLDialogElement),
    imDrop: div('imDrop'),
    imPick: btn('imPick'),
    imPasteToggle: btn('imPasteToggle'),
    imFile: inp('imFile'),
    imPaste: div('imPaste'),
    imText: find(root, 'imText', HTMLTextAreaElement),
    imRead: btn('imRead'),
    imResult: div('imResult'),
    imApply: btn('imApply'),
    imCancel: btn('imCancel'),
  };
}

export type Els = ReturnType<typeof queryEls>;
