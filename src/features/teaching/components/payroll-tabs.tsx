"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/payroll", label: "Bảng lương tháng" },
  { href: "/admin/payroll/settings", label: "Đơn giá & lớp" },
] as const;

export function PayrollTabs() {
  const pathname = usePathname();
  return (
    <nav className="grid max-w-sm grid-cols-2 gap-1 rounded-xl bg-muted p-1" aria-label="Mục lương">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn("rounded-lg px-3 py-1.5 text-center text-sm font-semibold", active ? "bg-card shadow-sm" : "text-muted-foreground")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
