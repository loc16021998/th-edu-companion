import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Nền logo TH EDU (biểu tượng + chữ, nền trong suốt) cho các trang quản trị / phụ huynh / giáo viên.
 * Cố định giữa màn hình, mờ nhẹ, nằm DƯỚI mọi nội dung (-z-10 trong khung `isolate` của layout) và không nhận click.
 * Kích thước: ~88% chiều rộng điện thoại, 70% máy tính, tối đa 760px, không vượt 62% chiều cao — luôn nằm gọn trong khung.
 */
export function PageWatermark({ className }: { className?: string }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 print:hidden flex items-center justify-center overflow-hidden px-6">
      {/* Bản tạo sẵn 720px, PNG 16 màu (~12KB — ở độ mờ 13% không thấy khác bản gốc 546KB), phục vụ thẳng từ /public:
          không qua bộ tối ưu ảnh lúc chạy → hiện ngay. Là ảnh lớn nhất trên nhiều trang (LCP) nên tải ưu tiên. */}
      <Image
        src="/brand/th-edu-watermark-720.png"
        alt=""
        width={720}
        height={546}
        unoptimized
        priority
        className={cn("h-auto max-h-[62dvh] w-[88vw] max-w-[760px] md:w-[70vw] object-contain opacity-[0.13] md:opacity-[0.14]", className)}
      />
    </div>
  );
}
