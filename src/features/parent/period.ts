import { addDays, addMonths, dayMonth, endOfMonth, fullDate, isISODate, startOfMonth, startOfWeek } from "@/lib/date";

export type PeriodView = "month" | "week";

export type Period = {
  view: PeriodView;
  from: string;
  to: string;
  label: string;
  prev: string;
  next: string;
  isCurrent: boolean;
};

/** Đọc ?view=month|week&date=YYYY-MM-DD; tham số sai → mặc định tháng hiện tại. */
export function resolvePeriod(viewParam: unknown, dateParam: unknown, today: string): Period {
  const view: PeriodView = viewParam === "week" ? "week" : "month";
  const anchor = isISODate(dateParam) ? dateParam : today;

  if (view === "week") {
    const from = startOfWeek(anchor);
    const to = addDays(from, 6);
    return {
      view,
      from,
      to,
      label: `${dayMonth(from)} – ${fullDate(to)}`,
      prev: addDays(from, -7),
      next: addDays(from, 7),
      isCurrent: from <= today && today <= to,
    };
  }

  const from = startOfMonth(anchor);
  const to = endOfMonth(anchor);
  return {
    view,
    from,
    to,
    label: `Tháng ${Number(from.slice(5, 7))}/${from.slice(0, 4)}`,
    prev: addMonths(anchor, -1),
    next: addMonths(anchor, 1),
    isCurrent: from <= today && today <= to,
  };
}
