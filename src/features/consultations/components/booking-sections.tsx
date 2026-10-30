import type { Booking } from "../queries";
import { BookingCard } from "./booking-card";

/** Chia lịch hẹn thành: chờ xác nhận · sắp tới · đã qua / đã huỷ. */
export function splitBookings(bookings: Booking[], now: string) {
  const pending = bookings.filter((b) => b.status === "pending" && b.startsAt > now);
  const upcoming = bookings.filter((b) => b.status === "confirmed" && b.startsAt > now);
  const past = bookings.filter((b) => !pending.includes(b) && !upcoming.includes(b)).reverse();
  return { pending, upcoming, past };
}

export function BookingSection({
  title,
  bookings,
  meId,
  now,
  empty,
  canManage = false,
}: {
  title: string;
  bookings: Booking[];
  meId: string;
  now: string;
  empty?: string;
  /** Quản trị viên: xác nhận / huỷ thay người chủ trì */
  canManage?: boolean;
}) {
  if (bookings.length === 0 && !empty) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
        {title} {bookings.length > 0 && <span className="tabular-nums">({bookings.length})</span>}
      </h2>
      {bookings.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-4 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {bookings.map((b) => (
            <BookingCard key={b.id} booking={b} meId={meId} now={now} canManage={canManage} />
          ))}
        </div>
      )}
    </section>
  );
}
