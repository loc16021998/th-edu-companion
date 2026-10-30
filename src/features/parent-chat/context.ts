import "server-only";
import { ATTENDANCE_LABELS, CAMPUS_LABELS, FEE_STATUS_LABELS, MOOD_LABELS, SUBJECTS, type SubjectKey, countAttendance } from "@/config/constants";
import { addDays, ageFrom, fullDate, weekdayLong } from "@/lib/date";
import { isSchoolDay } from "@/lib/schedule";
import { formatVND, givenName } from "@/lib/utils";
import { listAttendanceBetween } from "@/features/attendance/queries";
import { listDailyReportsBetween } from "@/features/daily-reports/queries";
import { listFees } from "@/features/fees/queries";
import { listStudents } from "@/features/students/queries";

const ATTENDANCE_DAYS = 30;
const REPORT_DAYS = 14;
const MAX_NOTE = 400;

function clip(text: string | null | undefined, max = MAX_NOTE): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function day(iso: string) {
  return `${weekdayLong(iso)} ${fullDate(iso)}`;
}

/**
 * Dữ liệu thật của các con (RLS: chỉ con của phụ huynh đang đăng nhập) dưới dạng văn bản ngắn gọn
 * để chatbot trả lời dựa trên dữ liệu, không bịa. Chỉ gửi tên gọi + tuổi (không gửi ngày sinh đầy đủ,
 * số điện thoại, ảnh) — tối thiểu dữ liệu cá nhân gửi ra ngoài.
 */
export async function buildFamilyContext(today: string): Promise<string> {
  const students = await listStudents();
  if (students.length === 0) return "Phụ huynh này chưa được nhà trường liên kết với học sinh nào.";

  const from = addDays(today, -(ATTENDANCE_DAYS - 1));
  const sections = await Promise.all(
    students.map(async (s) => {
      const name = givenName(s.full_name);
      const lines: string[] = [
        `## Bé ${name}`,
        `- Lớp ${s.class_name} · ${CAMPUS_LABELS[s.campus]}${s.dob ? ` · ${ageFrom(s.dob, today)} tuổi` : ""}`,
      ];

      try {
        const [attendance, reports, fees] = await Promise.all([
          listAttendanceBetween(s.id, from, today),
          listDailyReportsBetween(s.id, addDays(today, -(REPORT_DAYS - 1)), today),
          listFees(s.id),
        ]);

        // Hôm nay
        const todayAtt = attendance.find((a) => a.date === today);
        lines.push(
          `- Hôm nay (${day(today)}): ${
            !isSchoolDay(today)
              ? "Chủ nhật, không có buổi học"
              : todayAtt
                ? `${ATTENDANCE_LABELS[todayAtt.status]}${todayAtt.note ? ` (ghi chú: ${clip(todayAtt.note, 150)})` : ""}`
                : "giáo viên chưa điểm danh"
          }`,
        );

        // Điểm danh 30 ngày
        const count = countAttendance(attendance.map((a) => a.status));
        lines.push(
          `- Điểm danh ${ATTENDANCE_DAYS} ngày gần nhất (${fullDate(from)} – ${fullDate(today)}): ` +
            `${count.present} buổi có mặt, ${count.late} buổi đi muộn, ${count.absent} buổi nghỉ, ${count.absent_with_permission} buổi nghỉ có phép.`,
        );
        const irregular = attendance.filter((a) => a.status !== "present");
        for (const a of irregular) {
          lines.push(`  - ${day(a.date)}: ${ATTENDANCE_LABELS[a.status]}${a.note ? ` — ${clip(a.note, 150)}` : ""}`);
        }

        // Sổ liên lạc 14 ngày, mới nhất trước
        const recent = [...reports].reverse();
        lines.push(recent.length ? `- Sổ liên lạc ${REPORT_DAYS} ngày gần nhất:` : `- Chưa có sổ liên lạc trong ${REPORT_DAYS} ngày gần nhất.`);
        for (const r of recent) {
          const parts: string[] = [];
          if (r.mood) parts.push(`tâm trạng: ${MOOD_LABELS[r.mood]}`);
          for (const [key, entry] of Object.entries(r.subjects_summary)) {
            if (!entry) continue;
            const label = SUBJECTS[key as SubjectKey];
            parts.push(`${label}: ${entry.rating ? `${entry.rating}/5 sao` : "chưa chấm sao"}${entry.comment ? ` — ${clip(entry.comment, 200)}` : ""}`);
          }
          if (r.teacher_note) parts.push(`nhận xét của giáo viên: ${clip(r.teacher_note)}`);
          if (r.media_urls.length) parts.push(`${r.media_urls.length} ảnh/video`);
          lines.push(`  - ${day(r.date)}: ${parts.join("; ") || "(trống)"}`);
        }

        // Học phí
        if (fees.length === 0) {
          lines.push("- Học phí: chưa có khoản thu nào.");
        } else {
          const owed = fees.reduce((sum, f) => sum + (f.amount - f.paid_amount), 0);
          lines.push(`- Học phí: tổng còn phải đóng ${formatVND(owed)}.`);
          for (const f of fees) {
            const overdue = f.status !== "paid" && f.due_date && f.due_date < today;
            lines.push(
              `  - ${f.title}: ${formatVND(f.amount)}, đã đóng ${formatVND(f.paid_amount)}, trạng thái "${FEE_STATUS_LABELS[f.status]}"` +
                `${f.due_date ? `, hạn ${fullDate(f.due_date)}${overdue ? " (ĐÃ QUÁ HẠN)" : ""}` : ""}`,
            );
          }
        }
      } catch (err) {
        console.error("[parent-chat] Không tải được dữ liệu của bé:", err);
        lines.push("- (Hiện không tải được điểm danh / sổ liên lạc / học phí của bé — hãy đề nghị phụ huynh xem trực tiếp trong ứng dụng.)");
      }
      return lines.join("\n");
    }),
  );

  return sections.join("\n\n");
}
