"use client";

import { ErrorFallback } from "@/components/shared/error-fallback";

/** Lỗi trong trang quản trị — menu quản trị vẫn hiện, chỉ phần nội dung báo lỗi (đã tự báo về /admin/system). */
export default function AdminError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorFallback {...props} area="admin" />;
}
