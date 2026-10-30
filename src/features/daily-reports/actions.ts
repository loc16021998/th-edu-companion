"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { requireRole } from "@/features/auth/queries";
import { parseClassKey } from "@/features/teacher/classes";
import type { ActionResult } from "@/types/action-result";
import type { Json } from "@/types/database.types";
import { dailyReportFormSchema, type DailyReportFormValues } from "./schema";
import { isAbsence } from "@/config/constants";
import { schedulePushDelivery } from "@/features/push/deliver";

export type SaveDailyReportResult = {
  /** Số bạn cùng lớp được ghi nhận xét chung */
  appliedTo: number;
  /** Bỏ qua vì vắng mặt */
  skippedAbsent: number;
  /** Bỏ qua vì đã có nhận xét riêng (không ghi đè) */
  skippedHasNote: number;
};

/** Chỉ lưu môn có nội dung → JSONB gọn, phụ huynh không thấy môn trống. */
function compactSubjects(subjects: DailyReportFormValues["subjects"]): Json {
  const out: Record<string, { rating?: number; comment: string; criteria?: Record<string, number> }> = {};
  for (const [key, s] of Object.entries(subjects)) {
    const criteria = Object.fromEntries(Object.entries(s.criteria).filter((e): e is [string, number] => typeof e[1] === "number"));
    const hasCriteria = Object.keys(criteria).length > 0;
    if (s.rating === null && !s.comment && !hasCriteria) continue;
    out[key] = { ...(s.rating !== null && { rating: s.rating }), comment: s.comment, ...(hasCriteria && { criteria }) };
  }
  return out;
}

export async function saveDailyReport(input: DailyReportFormValues): Promise<ActionResult<SaveDailyReportResult>> {
  const parsed = dailyReportFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu sổ liên lạc không hợp lệ." };
  }
  const v = parsed.data;
  const cls = parseClassKey(v.classKey);
  if (!cls) return { ok: false, error: "Lớp học không hợp lệ." };

  const profile = await requireRole("teacher", "admin");
  const result: SaveDailyReportResult = { appliedTo: 0, skippedAbsent: 0, skippedHasNote: 0 };

  try {
    const supabase = await createClient();

    // Học sinh trong lớp (RLS: chỉ thấy lớp mình phụ trách) — đồng thời xác nhận bé thuộc lớp đã chọn
    const { data: classmates, error: classError } = await supabase
      .from("students")
      .select("id")
      .eq("campus", cls.campus)
      .eq("class_name", cls.className);
    if (classError) return { ok: false, error: dbErrorMessage(classError) };
    if (!classmates.some((c) => c.id === v.studentId)) {
      return { ok: false, error: "Học sinh không thuộc lớp đã chọn hoặc bạn không phụ trách lớp này." };
    }

    const { error } = await supabase.from("daily_reports").upsert(
      {
        student_id: v.studentId,
        teacher_id: profile.id, // RLS bắt buộc teacher_id = auth.uid()
        date: v.date,
        mood: v.mood,
        subjects_summary: compactSubjects(v.subjects),
        media_urls: v.media,
        teacher_note: v.teacherNote || null,
      },
      { onConflict: "student_id,date" },
    );
    if (error) {
      console.error("[daily-report] upsert thất bại:", error);
      return { ok: false, error: dbErrorMessage(error) };
    }

    if (v.applyNoteToClass) {
      const others = classmates.map((c) => c.id).filter((id) => id !== v.studentId);
      if (others.length > 0) {
        const [absentRes, existingRes] = await Promise.all([
          supabase.from("attendance").select("student_id, status").in("student_id", others).eq("date", v.date).neq("status", "present"),
          supabase.from("daily_reports").select("student_id, teacher_note").in("student_id", others).eq("date", v.date),
        ]);
        if (absentRes.error || existingRes.error) {
          return { ok: false, error: "Đã lưu sổ của bé, nhưng chưa áp dụng được cho cả lớp. Vui lòng thử lại." };
        }

        const absent = new Set(absentRes.data.filter((r) => isAbsence(r.status)).map((r) => r.student_id));
        const hasNote = new Set(existingRes.data.filter((r) => r.teacher_note?.trim()).map((r) => r.student_id));
        const targets = others.filter((id) => !absent.has(id) && !hasNote.has(id));
        result.skippedAbsent = others.filter((id) => absent.has(id)).length;
        result.skippedHasNote = others.filter((id) => !absent.has(id) && hasNote.has(id)).length;

        if (targets.length > 0) {
          // Chỉ gửi teacher_id + teacher_note → bản ghi đã có giữ nguyên tâm trạng/đánh giá/ảnh
          const { error: applyError } = await supabase.from("daily_reports").upsert(
            targets.map((id) => ({ student_id: id, date: v.date, teacher_id: profile.id, teacher_note: v.teacherNote })),
            { onConflict: "student_id,date" },
          );
          if (applyError) {
            console.error("[daily-report] áp dụng cả lớp thất bại:", applyError);
            return { ok: false, error: "Đã lưu sổ của bé, nhưng chưa áp dụng được cho cả lớp. Vui lòng thử lại." };
          }
          result.appliedTo = targets.length;
        }
      }
    }
  } catch (err) {
    console.error("[daily-report] saveDailyReport lỗi:", err);
    return { ok: false, error: "Không thể kết nối máy chủ. Vui lòng thử lại." };
  }

  revalidatePath("/teacher", "layout");
  revalidatePath("/admin", "layout");
  revalidatePath("/parent", "layout");
  // Đẩy thông báo lên điện thoại (Web Push / Zalo ZNS) ngay sau khi phản hồi
  schedulePushDelivery();
  return { ok: true, data: result };
}
