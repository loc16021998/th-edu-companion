"use client";

import { ErrorFallback } from "@/components/shared/error-fallback";

/** Lỗi trong trang phụ huynh — thanh tab / menu vẫn dùng được, chỉ phần nội dung báo lỗi. */
export default function ParentError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorFallback {...props} area="parent" />;
}
