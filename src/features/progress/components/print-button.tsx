"use client";

import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Xuất PDF bằng hộp thoại in của trình duyệt (chọn "Lưu dưới dạng PDF" / "Save as PDF").
 * Trang báo cáo có CSS in riêng: ẩn menu, nút; giữ nguyên tiếng Việt và biểu đồ dạng vector sắc nét.
 */
export function PrintButton({ fileName }: { fileName: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-9 rounded-full print:hidden"
      onClick={() => {
        // Tên file PDF gợi ý = tiêu đề trang khi in
        const previous = document.title;
        document.title = fileName;
        window.print();
        setTimeout(() => (document.title = previous), 500);
      }}
    >
      <FileDown /> Xuất PDF
    </Button>
  );
}
