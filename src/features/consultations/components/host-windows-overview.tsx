"use client";

import { useTransition } from "react";
import { Pause, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmSheet } from "@/components/ui/confirm-sheet";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { deleteAvailability, setAvailabilityActive } from "../actions";
import { MODE_LABELS, WEEKDAYS } from "../constants";
import type { AvailabilityWindow } from "../queries";
import { slotCount } from "../time";

/** Quản trị viên: khung giờ rảnh của từng giáo viên — tạm dừng / mở lại / xoá (giáo viên tự thêm & sửa). */
export function HostWindowsOverview({ groups }: { groups: { hostId: string; name: string; windows: AvailabilityWindow[] }[] }) {
  const [pending, startTransition] = useTransition();
  const day = (w: AvailabilityWindow) => WEEKDAYS.find((d) => d.value === w.weekday)?.label ?? "";

  const toggle = (w: AvailabilityWindow) =>
    startTransition(async () => {
      const res = await setAvailabilityActive({ id: w.id, active: !w.active });
      if (!res.ok) toast.error("Chưa lưu được", res.error);
    });
  const remove = async (w: AvailabilityWindow, name: string) => {
    if (!(await confirmSheet({ title: `Xoá khung ${day(w)} ${w.start}–${w.end} của ${name}?`, description: "Lịch hẹn đã đặt vẫn giữ nguyên.", confirmLabel: "Xoá", tone: "danger" }))) return;
    startTransition(async () => {
      const res = await deleteAvailability(w.id);
      if (!res.ok) toast.error("Chưa xoá được", res.error);
    });
  };

  if (groups.length === 0) {
    return <p className="rounded-2xl border border-dashed bg-card p-4 text-center text-sm text-muted-foreground">Chưa giáo viên nào mở khung giờ trao đổi.</p>;
  }
  return (
    <ul className="grid gap-2 lg:grid-cols-2">
      {groups.map((g) => (
        <li key={g.hostId} className="space-y-1.5 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
          <p className="font-bold">{g.name}</p>
          <ul className="divide-y">
            {g.windows.map((w) => (
              <li key={w.id} className={cn("flex items-center gap-2 py-1.5 text-sm", !w.active && "opacity-60")}>
                <span className="min-w-0 flex-1">
                  <span className="font-semibold tabular-nums">
                    {day(w)} {w.start}–{w.end}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {MODE_LABELS[w.mode].short} · {slotCount(w.start, w.end, w.slotMinutes)} ô × {w.slotMinutes} phút{!w.active && " · Đang tạm dừng"}
                  </span>
                </span>
                <Button size="icon" variant="ghost" disabled={pending} onClick={() => toggle(w)} aria-label={w.active ? "Tạm dừng khung giờ" : "Mở lại khung giờ"}>
                  {w.active ? <Pause className="size-4" /> : <Play className="size-4" />}
                </Button>
                <Button size="icon" variant="ghost" disabled={pending} className="text-rose-600" onClick={() => void remove(w, g.name)} aria-label="Xoá khung giờ">
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
