"use client";

import { confirmSheet } from "@/components/ui/confirm-sheet";

// Cờ "có thay đổi chưa lưu" dùng chung giữa form và các bộ chọn lớp/ngày (là component anh em,
// không chung state). Một form tại một thời điểm → module-level đủ dùng.
let dirty = false;

export function setUnsavedChanges(value: boolean) {
  dirty = value;
}

/** true nếu được phép rời đi (không có thay đổi, hoặc người dùng xác nhận bỏ — hỏi bằng Bottom Sheet). */
export async function confirmDiscardChanges(): Promise<boolean> {
  if (!dirty) return true;
  const ok = await confirmSheet({
    title: "Bỏ các thay đổi chưa lưu?",
    description: "Bạn có thay đổi chưa lưu. Rời đi sẽ mất các thay đổi này.",
    confirmLabel: "Bỏ thay đổi",
    cancelLabel: "Ở lại",
    tone: "danger",
  });
  if (ok) dirty = false;
  return ok;
}
