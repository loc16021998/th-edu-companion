import Link from "next/link";
import { Car, ChevronRight, Clock, MapPin } from "lucide-react";
import type { CampusProfile } from "@/config/campuses";
import { addDays, dayMonth, weekdayLong } from "@/lib/date";
import { hhmm, nextShiftDate, shiftPhase, type ShiftLike } from "@/lib/shifts";
import { givenName } from "@/lib/utils";
import { DirectionsButtons } from "./directions-buttons";

/**
 * "Đưa đón con hôm nay": đúng cơ sở bé đang học + giờ vào lớp / tan học + chỉ đường / gọi cô 1 chạm.
 * Không có bản đồ (nhẹ, đặt được trên trang Hôm nay); bản đồ đầy đủ ở /parent/campuses.
 */
export function PickupWidget({
  childName,
  className,
  campus,
  shift,
  today,
  mapHref,
}: {
  childName: string;
  className: string;
  campus: CampusProfile;
  shift: ShiftLike;
  today: string;
  mapHref?: string;
}) {
  const next = nextShiftDate(today, shift);
  const phase = next === today ? shiftPhase(today, shift) : "off";
  const start = hhmm(shift.start_time);
  const end = hhmm(shift.end_time);
  const when =
    next === today
      ? phase === "in_progress"
        ? `Bé đang học · đón lúc ${end}`
        : phase === "finished"
          ? `Đã tan học lúc ${end}`
          : `Đưa bé vào lớp trước ${start} · đón lúc ${end}`
      : `Hôm nay nghỉ · buổi tới ${next === addDays(today, 1) ? "ngày mai" : weekdayLong(next)} ${dayMonth(next)}, ${start}`;

  return (
    <section aria-labelledby="pickup-heading" className="overflow-hidden rounded-3xl bg-card shadow-md ring-1 ring-border">
      <div className="space-y-3 bg-gradient-to-br from-edu-blue-50 via-white to-edu-leaf-50 p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 id="pickup-heading" className="flex items-center gap-2 text-base font-extrabold">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Car className="size-5" />
            </span>
            Đưa đón {givenName(childName)} hôm nay
          </h2>
          {mapHref && (
            <Link href={mapHref} className="flex shrink-0 items-center gap-0.5 rounded-full bg-white/80 px-2.5 py-1 text-xs font-bold text-primary ring-1 ring-primary/20">
              Bản đồ <ChevronRight className="size-3.5" />
            </Link>
          )}
        </div>
        <div className="space-y-1.5">
          <p className="flex items-start gap-1.5 text-sm">
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              <span className="font-bold">TH EDU {campus.name}</span> · Lớp {className}
              <span className="block text-muted-foreground">{campus.address}</span>
            </span>
          </p>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Clock className="size-4 shrink-0 text-primary" /> {when}
          </p>
        </div>
      </div>
      <DirectionsButtons campus={campus} className="p-4 pt-3" />
    </section>
  );
}
