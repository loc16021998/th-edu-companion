"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/admissions", label: "Danh sách tư vấn" },
  { href: "/admin/admissions/trials", label: "Lịch học thử" },
] as const;

export function AdmissionsTabs() {
  const pathname = usePathname();
  return (
    <nav className="grid max-w-sm grid-cols-2 gap-1 rounded-xl bg-muted p-1" aria-label="Mục tuyển sinh">
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
