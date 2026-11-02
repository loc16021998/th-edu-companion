import { MapPin, Phone } from "lucide-react";
import { ORGANIZATION } from "@/config/constants";
import { cn } from "@/lib/utils";

/**
 * Footer thông tin đơn vị — dùng ở trang đăng nhập và các khu phụ huynh / giáo viên / quản trị.
 * Khối nằm giữa trang nhưng chữ căn thẳng lề trái: cột nhãn (Địa chỉ / SĐT) + cột nội dung thẳng hàng.
 * `besideFloating`: trang có nút nổi Zalo / Chat ở góc phải dưới (FloatingContact) → trên điện thoại / máy tính bảng chừa
 * cột bên phải cho nút, kéo hết trang thì địa chỉ / số điện thoại vẫn không bị nút che (bấm gọi được).
 */
export function SiteFooter({
  tone = "light",
  besideFloating = false,
  className,
}: {
  tone?: "light" | "dark";
  besideFloating?: boolean;
  className?: string;
}) {
  const dark = tone === "dark";

  return (
    <footer
      className={cn(
        "border-t px-4 py-6 text-sm font-bold leading-relaxed md:text-sm",
        dark ? "border-white/10 text-white/85" : "text-foreground/80",
        besideFloating && "pr-[5.5rem] lg:pr-4",
        className,
      )}
    >
      <div className="mx-auto w-fit max-w-full text-left">
        <p className={cn("text-base font-extrabold uppercase tracking-wide md:text-lg", dark ? "text-white" : "text-foreground")}>
          {ORGANIZATION.name}
        </p>

        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
          <dt className="flex items-center gap-1.5 whitespace-nowrap">
            <MapPin className={cn("size-4 shrink-0", dark ? "text-edu-blue-200" : "text-primary")} /> Địa chỉ:
          </dt>
          <dd className="space-y-0.5">
            {ORGANIZATION.campuses.map((c) => (
              <p key={c.label}>
                {c.label}: {c.address}
              </p>
            ))}
          </dd>

          <dt className="flex items-center gap-1.5 whitespace-nowrap">
            <Phone className={cn("size-4 shrink-0", dark ? "text-edu-blue-200" : "text-primary")} /> SĐT:
          </dt>
          {/* Cột hẹp cạnh nút nổi (điện thoại): mỗi số một dòng, không để dấu "-" lơ lửng đầu dòng */}
          <dd className={cn("flex flex-wrap items-center gap-x-2", besideFloating && "max-sm:flex-col max-sm:items-start")}>
            {ORGANIZATION.phones.map((p, i) => (
              <span key={p.tel} className="flex items-center gap-2">
                {i > 0 && (
                  <span aria-hidden className={cn(besideFloating && "max-sm:hidden")}>
                    -
                  </span>
                )}
                <a
                  href={`tel:${p.tel}`}
                  className={cn("tabular-nums underline-offset-4 hover:underline", dark ? "text-edu-blue-200" : "text-primary")}
                >
                  {p.display}
                </a>
              </span>
            ))}
          </dd>
        </dl>
      </div>
    </footer>
  );
}
