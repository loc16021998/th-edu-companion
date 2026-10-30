import "server-only";
import { createClient } from "@/lib/supabase/server";
import { resolveMediaUrls } from "./media";
import { subjectsSummarySchema } from "./schema";

const REPORT_WITH_TEACHER = "*, teacher:profiles!daily_reports_teacher_id_fkey(full_name, avatar_url)";

function parseSubjects(value: unknown) {
  return subjectsSummarySchema.catch({}).parse(value);
}

/** Nhận xét hằng ngày của 1 học sinh, mới nhất trước, kèm tên giáo viên. */
export async function listDailyReports(studentId: string, limit = 30) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_reports")
    .select(REPORT_WITH_TEACHER)
    .eq("student_id", studentId)
    .order("date", { ascending: false })
    .limit(limit);
  if (error) throw new Error("Không tải được nhận xét", { cause: error });

  return data.map((r) => ({ ...r, subjects_summary: parseSubjects(r.subjects_summary) }));
}

/** Nhận xét gần nhất (kèm ảnh/video đã ký URL) — dùng cho trang chủ phụ huynh. */
export async function getLatestDailyReport(studentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_reports")
    .select(REPORT_WITH_TEACHER)
    .eq("student_id", studentId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Không tải được nhận xét", { cause: error });
  if (!data) return null;

  return {
    ...data,
    subjects_summary: parseSubjects(data.subjects_summary),
    media: await resolveMediaUrls(data.media_urls),
  };
}

export type LatestDailyReport = NonNullable<Awaited<ReturnType<typeof getLatestDailyReport>>>;

/** Trạng thái sổ liên lạc của nhiều học sinh trong 1 ngày (danh sách lớp của giáo viên). */
export async function listReportsOn(studentIds: string[], date: string) {
  if (studentIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_reports")
    .select("student_id, mood, teacher_note, media_urls")
    .in("student_id", studentIds)
    .eq("date", date);
  if (error) throw new Error("Không tải được sổ liên lạc", { cause: error });
  return data;
}

/** Sổ liên lạc của 1 học sinh trong 1 ngày (để sửa) — kèm URL xem trước cho ảnh đã có. */
export async function getDailyReportOn(studentId: string, date: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_reports")
    .select("id, student_id, teacher_id, date, mood, subjects_summary, teacher_note, media_urls, created_at")
    .eq("student_id", studentId)
    .eq("date", date)
    .maybeSingle();
  if (error) throw new Error("Không tải được sổ liên lạc", { cause: error });
  if (!data) return null;

  const media = await resolveMediaUrls(data.media_urls);
  return { ...data, subjects_summary: parseSubjects(data.subjects_summary), media };
}

/** Nhận xét trong khoảng [from, to] — dùng cho trang lịch sử (không ký media để nhẹ). */
export async function listDailyReportsBetween(studentId: string, from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_reports")
    .select("id, date, mood, teacher_note, subjects_summary, media_urls")
    .eq("student_id", studentId)
    .gte("date", from)
    .lte("date", to)
    .order("date");
  if (error) throw new Error("Không tải được lịch sử nhận xét", { cause: error });

  return data.map((r) => ({ ...r, subjects_summary: parseSubjects(r.subjects_summary) }));
}
