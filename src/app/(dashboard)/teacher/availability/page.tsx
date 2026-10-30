import type { Metadata } from "next";
import { connection } from "next/server";
import { requireRole } from "@/features/auth/queries";
import { MarkNotificationsRead } from "@/features/notifications/components/mark-read";
import { TEACHER_TOPIC_SUGGESTIONS } from "@/features/consultations/constants";
import { listAvailability, listBookingHosts, listMyBookings, listSlotsFor } from "@/features/consultations/queries";
import { AvailabilityEditor } from "@/features/consultations/components/availability-editor";
import { BookingFlow } from "@/features/consultations/components/booking-flow";
import { BookingSection, splitBookings } from "@/features/consultations/components/booking-sections";

export const metadata: Metadata = { title: "Lịch hẹn trao đổi" };

export default async function TeacherAvailabilityPage() {
  await connection();
  const profile = await requireRole("teacher");
  const [{ available, windows }, { bookings }, { hosts: admins }] = await Promise.all([listAvailability(profile.id), listMyBookings(profile), listBookingHosts(null)]);
  const slots = await listSlotsFor(admins);
  const now = new Date().toISOString();
  const { pending, upcoming, past } = splitBookings(bookings, now);

  return (
    <div className="space-y-6">
      <MarkNotificationsRead types={["booking_requested", "booking_decided", "booking_reminder"]} />
      <div>
        <h1 className="text-xl font-extrabold">Lịch hẹn trao đổi</h1>
        <p className="text-sm text-muted-foreground">
          Mở khung giờ rảnh → phụ huynh đặt lịch → bạn xác nhận. Bạn cũng đặt được lịch với Ban quản lý. Hệ thống nhắc cả 2 bên trước giờ hẹn 30 phút.
        </p>
      </div>
      {!available ? (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Tính năng lịch hẹn chưa được cài đặt — quản trị viên cần chạy file <code>supabase/apply-consultations.sql</code>.
        </p>
      ) : (
        <>
          <BookingSection title="Chờ bạn xác nhận" bookings={pending.filter((b) => b.host.id === profile.id)} meId={profile.id} now={now} />
          <BookingSection title="Lịch hẹn sắp tới" bookings={[...pending.filter((b) => b.host.id !== profile.id), ...upcoming]} meId={profile.id} now={now} empty="Chưa có lịch hẹn nào sắp tới." />
          <AvailabilityEditor windows={windows} />
          {admins.length > 0 && (
            <BookingFlow
              studentId={null}
              title="Đặt lịch trao đổi với Ban quản lý"
              hosts={admins}
              slots={slots}
              suggestions={TEACHER_TOPIC_SUGGESTIONS}
              emptyText="Ban quản lý chưa mở khung giờ trao đổi."
            />
          )}
          <BookingSection title="Đã qua / đã huỷ (14 ngày)" bookings={past} meId={profile.id} now={now} />
        </>
      )}
    </div>
  );
}
