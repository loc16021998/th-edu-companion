import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Period, PeriodView } from "../period";

export function PeriodFilter({
  period,
  hrefFor,
}: {
  period: Period;
  hrefFor: (view: PeriodView, date?: string) => string;
}) {
  const tabs: { view: PeriodView; label: string }[] = [
    { view: "month", label: "Theo tháng" },
    { view: "week", label: "Theo tuần" },
  ];

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Kiểu xem" className="grid grid-cols-2 rounded-full bg-muted p-1">
        {tabs.map((t) => {
          const active = t.view === period.view;
          return (
            <Link
              key={t.view}
              role="tab"
              aria-selected={active}
              href={hrefFor(t.view, period.from)}
              className={cn(
                "rounded-full py-2 text-center text-sm font-semibold transition-colors",
                active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 rounded-2xl bg-card p-1.5 shadow-sm ring-1 ring-border">
        <Link
          href={hrefFor(period.view, period.prev)}
          aria-label={period.view === "month" ? "Tháng trước" : "Tuần trước"}
          className="flex size-10 items-center justify-center rounded-xl active:bg-accent"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div className="text-center">
          <p className="font-bold">{period.label}</p>
          {!period.isCurrent && (
            <Link href={hrefFor(period.view)} className="text-xs font-semibold text-primary">
              Về {period.view === "month" ? "tháng" : "tuần"} này
            </Link>
          )}
        </div>
        <Link
          href={hrefFor(period.view, period.next)}
          aria-label={period.view === "month" ? "Tháng sau" : "Tuần sau"}
          className="flex size-10 items-center justify-center rounded-xl active:bg-accent"
        >
          <ChevronRight className="size-5" />
        </Link>
      </div>
    </div>
  );
}
