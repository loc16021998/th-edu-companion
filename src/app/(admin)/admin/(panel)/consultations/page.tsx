import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { addDays, isISODate, todayVN } from "@/lib/date";
import { cn } from "@/lib/utils";
import { requireRole } from "@/features/auth/queries";
import { AdminFeedMarkRead } from "@/features/admin-feed/components/admin-feed-mark-read";
import { MarkNotificationsRead } from "@/features/notifications/components/mark-read";
import { STATUS_LABELS, statusOf, type BookingStatus } from "@/features/consultations/constants";
import { listAllBookings, listAvailability, listSchedulingDirectory } from "@/features/consultations/queries";
import { AdminScheduleButton } from "@/features/consultations/components/admin-schedule-sheet";
import { AvailabilityEditor } from "@/features/consultations/components/availability-editor";
import { BookingSection, splitBookings } from "@/features/consultations/components/booking-sections";
import { HostWindowsOverview } from "@/features/consultations/components/host-windows-overview";
import { vnDate } from "@/features/consultations/time";

export const metadata: Metadata = { title: "Lịch hẹn trao đổi" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function AdminConsultationsPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await searchParams;
  const profile = await requireRole("admin");
  const today = todayVN();
  const tab = params.tab === "windows" ? "windows" : "bookings";
  const from = isISODate(params.from) ? params.from : addDays(today, -7);
  const to = isISODate(params.to) && params.to >= from ? params.to : addDays(today, 30);
  const status = one(params.status) && one(params.status)! in STATUS_LABELS ? statusOf(one(params.status)!) : undefined;
  const hostId = one(params.host) ?? "";

  const [people, all, windows] = await Promise.all([
    listSchedulingDirectory(),
    listAllBookings({ from, to, status, hostId: hostId || undefined }),
    listAvailability(),
  ]);
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const hosts = people.filter((p) => p.role === "teacher" || p.role === "admin");
  const now = new Date().toISOString();
  const { pending, upcoming, past } = splitBookings(all.bookings, now);
  const weekEnd = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const thisMonth = today.slice(0, 7);
  const stats = [
    { label: "Chờ xác nhận", value: pending.length, tone: "text-amber-700" },
    { label: "Sắp tới 7 ngày", value: upcoming.filter((b) => b.startsAt <= weekEnd).length, tone: "text-emerald-700" },
    { label: "Đã diễn ra tháng này", value: all.bookings.filter((b) => b.status === "confirmed" && b.startsAt <= now && vnDate(b.startsAt).startsWith(thisMonth)).length, tone: "text-sky-700" },
    { label: "Huỷ / không nhận", value: all.bookings.filter((b) => b.status === "cancelled" || b.status === "declined").length, tone: "text-rose-700" },
  ];

  const tabClass = (active: boolean) => cn("rounded-lg px-3 py-1.5 text-center text-sm font-semibold", active ? "bg-card shadow-sm" : "text-muted-foreground");
  const myWindows = windows.windows.filter((w) => w.hostId === profile.id);
  const byHost = new Map<string, typeof windows.windows>();
  for (const w of windows.windows) if (w.hostId !== profile.id) byHost.set(w.hostId, [...(byHost.get(w.hostId) ?? []), w]);
  const others = [...byHost.entries()]
    .map(([id, list]) => ({ hostId: id, name: nameOf.get(id) ?? "Giáo viên", windows: list }))
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));

  return (
    <div className="space-y-5">
      <AdminFeedMarkRead category="consultation" />
      <MarkNotificationsRead types={["booking_requested", "booking_decided", "booking_reminder"]} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold">Lịch hẹn trao đổi</h1>
          <p className="text-sm text-muted-foreground">
            Quản lý mọi lịch hẹn phụ huynh – giáo viên – Ban quản lý: xác nhận / huỷ thay giáo viên, lên lịch trực tiếp, mở khung giờ cho phụ huynh và giáo viên đặt.
          </p>
        </div>
        {all.available && <AdminScheduleButton meId={profile.id} people={people.filter((p) => p.id !== profile.id)} />}
      </div>

      {!all.available ? (
        <div className="space-y-2 rounded-2xl bg-card p-5 text-sm shadow-sm ring-1 ring-amber-200">
          <p className="font-bold">Database chưa cập nhật</p>
          <p className="text-muted-foreground">
            Mở Supabase Dashboard → SQL Editor, dán toàn bộ nội dung file <span className="font-mono text-xs font-semibold text-foreground">supabase/apply-consultations.sql</span> rồi
            bấm Run, sau đó tải lại trang.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
                <p className={cn("text-2xl font-extrabold tabular-nums", s.tone)}>{s.value}</p>
                <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          <nav className="grid max-w-sm grid-cols-2 gap-1 rounded-xl bg-muted p-1" aria-label="Chọn mục">
            <Link href="/admin/consultations" className={tabClass(tab === "bookings")} aria-current={tab === "bookings" ? "page" : undefined}>
              Lịch hẹn
            </Link>
            <Link href="/admin/consultations?tab=windows" className={tabClass(tab === "windows")} aria-current={tab === "windows" ? "page" : undefined}>
              Khung giờ rảnh
            </Link>
          </nav>

          {tab === "bookings" ? (
            <>
              {/* Bộ lọc: form GET thường — chạy được cả khi JS chưa tải xong */}
              <form className="grid grid-cols-2 gap-2 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border sm:grid-cols-5 sm:items-end" method="get">
                <label className="space-y-1 text-xs font-semibold">
                  Từ ngày
                  <input type="date" name="from" defaultValue={from} className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm font-normal" />
                </label>
                <label className="space-y-1 text-xs font-semibold">
                  Đến ngày
                  <input type="date" name="to" defaultValue={to} className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm font-normal" />
                </label>
                <label className="space-y-1 text-xs font-semibold">
                  Trạng thái
                  <select name="status" defaultValue={status ?? ""} className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm font-normal">
                    <option value="">Tất cả</option>
                    {(Object.keys(STATUS_LABELS) as BookingStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s].label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs font-semibold">
                  Người chủ trì
                  <select name="host" defaultValue={hostId} className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm font-normal">
                    <option value="">Tất cả</option>
                    {hosts.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.role === "admin" ? `Ban quản lý · ${h.name}` : h.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="col-span-2 flex gap-2 sm:col-span-1">
                  <button type="submit" className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
                    Lọc
                  </button>
                  <Link href="/admin/consultations" className="rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground ring-1 ring-border">
                    Xoá lọc
                  </Link>
                </div>
              </form>

              <BookingSection title="Chờ xác nhận" bookings={pending} meId={profile.id} now={now} canManage />
              <BookingSection title="Sắp tới" bookings={upcoming} meId={profile.id} now={now} canManage empty="Không có lịch hẹn sắp tới trong khoảng ngày đã chọn." />
              <BookingSection title="Đã qua / đã huỷ" bookings={past} meId={profile.id} now={now} canManage />
            </>
          ) : (
            <>
              <AvailabilityEditor
                windows={myWindows}
                chooseAudience
                description="Khung giờ của bạn (Ban quản lý). Chọn dành cho phụ huynh, giáo viên hoặc cả hai — họ đặt 1 ô, bạn xác nhận."
              />
              <section className="space-y-2">
                <h2 className="text-lg font-bold">Khung giờ của giáo viên</h2>
                <p className="text-sm text-muted-foreground">Giáo viên tự thêm & sửa khung giờ; bạn có thể tạm dừng hoặc xoá khi cần.</p>
                <HostWindowsOverview groups={others} />
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
