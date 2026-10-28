/** Mở hộp thoại modal bằng thẻ dialog của trình duyệt (tự bẫy focus, Esc để đóng) và trả focus về nút đã mở nó. */
export function openDialog(d: HTMLDialogElement): void {
  if (d.open) return;
  const opener = document.activeElement as HTMLElement | null;
  d.addEventListener('close', () => opener?.focus?.(), { once: true });
  d.showModal();
}

/** Tải một đoạn văn bản về máy dưới dạng file. */
export function downloadText(filename: string, text: string, type = 'application/json'): void {
  downloadBlob(filename, new Blob([text], { type: `${type};charset=utf-8` }));
}

/** Tải một khối dữ liệu (ảnh, file) về máy. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  // chờ trình duyệt bắt đầu tải rồi mới thu hồi
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Chép chữ vào bộ nhớ tạm. Trả về false nếu trình duyệt không cho. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* thử cách cũ bên dưới */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
