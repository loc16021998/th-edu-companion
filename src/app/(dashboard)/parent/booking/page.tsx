import type { Metadata } from "next";
import { connection } from "next/server";
import { givenName } from "@/lib/utils";
import { requireRole } from "@/features/auth/queries";
import { getSelectedChild } from "@/features/parent/children";
import { NoChildren } from "@/features/parent/components/no-children";
import { EmptyState } from "@/features/parent/components/section";
import { MarkNotificationsRead } from "@/features/notifications/components/mark-read";
import { TOPIC_SUGGESTIONS } from "@/features/consultations/constants";
import { listBookingHosts, listMyBookings, listSlotsFor } from "@/features/consultations/queries";
import { BookingFlow } from "@/features/consultations/components/booking-flow";
import { BookingSection, splitBookings } from "@/features/consultations/components/booking-sections";

export const metadata: Metadata = { title: "Đặt lịch hẹn trao đổi" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ParentBookingPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await searchParams;
  const profile = await requireRole("parent");
  const { child } = await getSelectedChild(params.child);
  if (!child) return <NoChildren />;

  const [{ available, hosts }, { bookings }] = await Promise.all([listBookingHosts(child.id), listMyBookings(profile, { studentIds: [child.id] })]);
  const slots = await listSlotsFor(hosts);
  const now = new Date().toISOString();
  const { pending, upcoming, past } = splitBookings(bookings, now);
  const name = givenName(child.full_name);
  const teachers = hosts.filter((h) => h.role === "teacher");

  return (
    <div className="space-y-6">
      <MarkNotificationsRead types={["booking_decided", "booking_reminder"]} studentId={child.id} />
      <div>
        <h1 className="text-xl font-extrabold">Đặt lịch hẹn trao đổi</h1>
        <p className="text-sm text-muted-foreground">
          Trao đổi riêng với cô chủ nhiệm hoặc Ban quản lý trung tâm về việc học của bé — trực tuyến, gọi điện hoặc gặp tại trung tâm.
        </p>
      </div>
      {!available ? (
        <EmptyState emoji="📅" title="Tính năng đặt lịch hẹn đang được trung tâm cài đặt" description="Trong lúc chờ, anh/chị có thể nhắn tin trực tiếp cho cô." />
      ) : (
        <>
          <BookingSection title="Lịch hẹn sắp tới" bookings={upcoming} meId={profile.id} now={now} />
          <BookingSection title="Đang chờ xác nhận" bookings={pending} meId={profile.id} now={now} />
          <BookingFlow
            key={child.id}
            studentId={child.id}
            title={`Đặt lịch trao đổi về bé ${name}`}
            hosts={hosts}
            slots={slots}
            suggestions={TOPIC_SUGGESTIONS}
            emptyText={
              teachers.length === 0
                ? "Lớp của bé chưa có giáo viên chủ nhiệm trên hệ thống. Anh/chị vui lòng liên hệ trung tâm."
                : `${teachers.map((t) => t.name).join(", ")} chưa mở khung giờ trao đổi. Anh/chị có thể nhắn tin trực tiếp cho cô trong mục Nhắn tin.`
            }
          />
          <BookingSection title="Đã qua / đã huỷ (14 ngày)" bookings={past} meId={profile.id} now={now} />
        </>
      )}
    </div>
  );
}
