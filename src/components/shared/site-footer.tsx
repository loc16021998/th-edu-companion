import { MapPin, Phone } from "lucide-react";
import { ORGANIZATION } from "@/config/constants";
import { cn } from "@/lib/utils";

/**
 * Footer thông tin đơn vị — dùng ở trang đăng nhập và các khu phụ huynh / giáo viên / quản trị.
 * Khối nằm giữa trang nhưng chữ căn thẳng lề trái: cột nhãn (Địa chỉ / SĐT) + cột nội dung thẳng hàng.
 */
export function SiteFooter({ tone = "light", className }: { tone?: "light" | "dark"; className?: string }) {
  const dark = tone === "dark";

  return (
    <footer
      className={cn(
        "border-t px-4 py-6 text-sm font-bold leading-relaxed md:text-sm",
        dark ? "border-white/10 text-white/85" : "text-foreground/80",
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
          <dd className="flex flex-wrap items-center gap-x-2">
            {ORGANIZATION.phones.map((p, i) => (
              <span key={p.tel} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden>-</span>}
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
