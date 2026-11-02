// Hàm thuần dùng chung server + client cho bản tin phụ huynh.
import { addDays, dayMonth } from "@/lib/date";
import type { Tables } from "@/types/database.types";

type NotificationRef = Pick<Tables<"notifications">, "type" | "student_id" | "ref_date"> & { ref_id?: string | null };

/**
 * Trang đích khi chạm thông báo: trả lời phản hồi → tab Phản hồi;
 * điểm danh / sổ liên lạc hôm nay → tab Học tập, ngày cũ → tuần đó trong tab Chuyên cần.
 */
export function notificationHref(n: NotificationRef, today: string, role: "parent" | "teacher" | "admin" = "parent"): string {
  // Góc khoảnh khắc → bảng tin của lớp, mở đúng bài
  if (n.type === "moment_posted" || n.type === "moment_comment") {
    const q = new URLSearchParams();
    if (role === "parent" && n.student_id) q.set("child", n.student_id);
    if (n.ref_id) q.set("m", n.ref_id);
    return `/${role}/moments${q.size ? `?${q}` : ""}${n.ref_id ? `#moment-${n.ref_id}` : ""}`;
  }
  if (n.type === "feedback") return "/parent/feedback";
  // Đơn xin nghỉ: giáo viên → trang duyệt đơn; phụ huynh → trang đơn của bé
  if (n.type === "leave_request") return n.ref_id ? `/teacher/leave-requests#l-${n.ref_id}` : "/teacher/leave-requests";
  // Lịch học thử được phân công → trang Học thử của giáo viên, mở đúng buổi
  if (n.type === "trial_assigned") return n.ref_id ? `/teacher/trials#t-${n.ref_id}` : "/teacher/trials";
  // Kết quả đơn xin chuyển cơ sở → trang Cơ sở & đưa đón của bé
  if (n.type === "campus_transfer") return n.student_id ? `/parent/campuses?${new URLSearchParams({ child: n.student_id })}` : "/parent/campuses";
  // Lịch hẹn trao đổi → giáo viên: trang Lịch hẹn; phụ huynh: mục Đặt lịch hẹn của bé — mở đúng lịch
  if (n.type === "booking_requested" || n.type === "booking_decided" || n.type === "booking_reminder") {
    const hash = n.ref_id ? `#b-${n.ref_id}` : "";
    if (role === "admin") return `/admin/consultations${hash}`;
    if (role === "teacher") return `/teacher/availability${hash}`;
    return `/parent/booking${n.student_id ? `?${new URLSearchParams({ child: n.student_id })}` : ""}${hash}`;
  }
  // Cô tặng sao / huy hiệu → Góc Thành tích của bé, đúng tháng đó
  if (n.type === "achievement") {
    const q = new URLSearchParams({ month: `${n.ref_date.slice(0, 7)}-01` });
    if (n.student_id) q.set("child", n.student_id);
    return `/parent/achievements?${q}`;
  }
  if (n.type === "leave_decided") return n.student_id ? `/parent/leave-request?${new URLSearchParams({ child: n.student_id })}` : "/parent/leave-request";
  // Thông báo chung của trung tâm → trang Thông báo, cuộn tới đúng bài
  if (n.type === "announcement") return n.ref_id ? `/parent/announcements#a-${n.ref_id}` : "/parent/announcements";
  // Thông báo / nhắc học phí → trang Học phí, MỞ SẴN mã VietQR của đúng khoản đó (đã điền số tiền còn phải đóng)
  if (n.type === "fee_issued" || n.type === "fee_reminder" || n.type === "fee_paid") {
    const q = new URLSearchParams();
    if (n.student_id) q.set("child", n.student_id);
    if (n.type !== "fee_paid" && n.ref_id) q.set("pay", n.ref_id);
    return `/parent/fees${q.size ? `?${q}` : ""}${n.ref_id ? `#fee-${n.ref_id}` : ""}`;
  }
  // Bài tập mới / cô đã chấm → mục Bài tập của bé
  if (n.type === "homework_assigned" || n.type === "homework_graded") {
    return n.student_id ? `/parent/homework?${new URLSearchParams({ child: n.student_id })}` : "/parent/homework";
  }
  // Tổng kết tháng → trang Tiến độ của bé, đúng tháng đó
  if (n.type === "monthly_summary") {
    const q = new URLSearchParams({ month: n.ref_date });
    if (n.student_id) q.set("child", n.student_id);
    return `/parent/progress?${q}`;
  }
  const params = new URLSearchParams();
  if (n.student_id) params.set("child", n.student_id);
  if (n.ref_date === today) return `/parent/dashboard?${params}`;
  params.set("view", "week");
  params.set("date", n.ref_date);
  return `/parent/attendance?${params}`;
}

const TZ = "Asia/Ho_Chi_Minh";
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });

/** "Vừa xong" · "5 phút trước" · "3 giờ trước" · "Hôm qua 14:05" · "20/10 14:05". */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (diffMin < 1) return "Vừa xong";
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffMin < 6 * 60) return `${Math.floor(diffMin / 60)} giờ trước`;

  const day = dayFmt.format(date);
  const today = dayFmt.format(now);
  const time = timeFmt.format(date);
  if (day === today) return `Hôm nay ${time}`;
  if (day === addDays(today, -1)) return `Hôm qua ${time}`;
  return `${dayMonth(day)} ${time}`;
}
