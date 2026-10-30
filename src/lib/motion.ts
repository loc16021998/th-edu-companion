"use client";

/**
 * Phát lại 1 animation CSS trên phần tử (kể cả khi bấm liên tục): gỡ class → ép trình duyệt tính lại → gắn lại.
 * Dùng cho phản hồi khi bấm: tim "bật" khi thả, nút "Nộp bài" nảy lên.
 */
export function playAnimation(el: Element | null, className: string) {
  if (!(el instanceof HTMLElement)) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
  el.addEventListener("animationend", () => el.classList.remove(className), { once: true });
}
