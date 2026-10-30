// Sau mỗi lần build/deploy, ID của Server Action thay đổi. Tab đang mở từ bản cũ gọi action
// sẽ nhận lỗi "Server Action ... was not found on the server". Cách xử lý đúng là tải lại trang
// để nhận bundle mới. Có chặn vòng lặp: chỉ tự reload tối đa 1 lần / 30 giây.

const RELOAD_KEY = "th-edu:stale-reload-at";
const RELOAD_COOLDOWN_MS = 30_000;

export function isStaleDeploymentError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /Server Action .* was not found on the server/i.test(message) ||
    /Failed to find Server Action/i.test(message) ||
    /ChunkLoadError|Loading chunk [\w-]+ failed/i.test(message)
  );
}

/** Tải lại trang nếu chưa reload gần đây. Trả về true nếu đã kích hoạt reload. */
export function reloadForStaleDeployment(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // sessionStorage bị chặn (chế độ riêng tư...) — vẫn reload, chấp nhận không có chống lặp
  }
  window.location.reload();
  return true;
}
