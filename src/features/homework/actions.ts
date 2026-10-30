"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { formDataToObject, formError, formSuccess, zodFormError, type FormState } from "@/lib/form-state";
import { requireRole } from "@/features/auth/queries";
import { parseClassKey } from "@/features/teacher/classes";
import type { ActionResult } from "@/types/action-result";
import { schedulePushDelivery } from "@/features/push/deliver";
import { createAssignmentSchema, gradeSubmissionSchema, submitHomeworkSchema, type GradeSubmissionInput, type SubmitHomeworkInput } from "./schema";
import { INVALID_ID, isUuid } from "@/lib/validation";

const CONNECTION_ERROR = "Không thể kết nối máy chủ. Vui lòng thử lại.";
const MISSING_TABLE = "Database chưa có bảng bài tập — nhờ quản trị viên chạy file supabase/apply-homework.sql.";

function revalidateHomework() {
  revalidatePath("/teacher", "layout");
  revalidatePath("/admin", "layout");
  revalidatePath("/parent", "layout");
}

// ============================================================================ Giáo viên: giao bài

export async function createAssignment(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = createAssignmentSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFormError(parsed.error);
  const cls = parseClassKey(parsed.data.classKey);
  if (!cls) return formError("Lớp không hợp lệ.", { classKey: "Vui lòng chọn lại lớp" });
  const profile = await requireRole("teacher", "admin");
  const v = parsed.data;

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("homework_assignments").insert({
      campus: cls.campus,
      class_name: cls.className,
      title: v.title,
      instructions: v.instructions,
      subject: v.subject,
      submission_type: v.submissionType,
      due_date: v.dueDate,
      teacher_id: profile.id, // RLS: giáo viên chỉ giao bài đứng tên mình, cho lớp mình phụ trách
    });
    if (error) {
      if (error.code === "PGRST205") return formError(MISSING_TABLE);
      if (error.code === "42501") return formError("Bạn không phụ trách lớp này.");
      console.error("[homework] createAssignment lỗi:", error);
      return formError(dbErrorMessage(error));
    }
  } catch (err) {
    console.error("[homework] createAssignment lỗi:", err);
    return formError(CONNECTION_ERROR);
  }

  revalidateHomework();
  schedulePushDelivery();
  return formSuccess(`Đã giao bài "${v.title}" cho lớp ${cls.className}. Phụ huynh nhận thông báo ngay.`);
}

export async function deleteAssignment(id: string): Promise<ActionResult<null>> {
  if (!isUuid(id)) return { ok: false, error: INVALID_ID };
  await requireRole("teacher", "admin");
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("homework_assignments").delete().eq("id", id);
    if (error) return { ok: false, error: dbErrorMessage(error) };
  } catch (err) {
    console.error("[homework] deleteAssignment lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateHomework();
  return { ok: true, data: null };
}

// ============================================================================ Phụ huynh: nộp bài

/** Nộp / nộp lại bài (chỉ khi cô chưa chấm — RLS chặn sửa bài đã chấm). */
export async function submitHomework(input: SubmitHomeworkInput): Promise<ActionResult<null>> {
  const parsed = submitHomeworkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  const profile = await requireRole("parent");
  const v = parsed.data;

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("homework_submissions").upsert(
      {
        assignment_id: v.assignmentId,
        student_id: v.studentId,
        parent_id: profile.id,
        media_paths: v.mediaPaths,
        parent_note: v.note || null,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "assignment_id,student_id" },
    );
    if (error) {
      if (error.code === "PGRST205") return { ok: false, error: MISSING_TABLE };
      if (error.code === "42501") return { ok: false, error: "Bài đã được cô chấm nên không sửa được nữa." };
      console.error("[homework] submitHomework lỗi:", error);
      return { ok: false, error: dbErrorMessage(error) };
    }
  } catch (err) {
    console.error("[homework] submitHomework lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }

  revalidateHomework();
  return { ok: true, data: null };
}

// ============================================================================ Giáo viên: chấm bài, thả tim, tặng sao

export async function gradeSubmission(input: GradeSubmissionInput): Promise<ActionResult<null>> {
  const parsed = gradeSubmissionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  const profile = await requireRole("teacher", "admin");
  const v = parsed.data;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("homework_submissions")
      .update({
        status: "graded",
        hearted: v.hearted,
        stars: v.stars,
        teacher_comment: v.comment || null,
        voice_path: v.voicePath,
        graded_by: profile.id,
        graded_at: new Date().toISOString(),
      })
      .eq("id", v.submissionId)
      .select("id");
    if (error) {
      console.error("[homework] gradeSubmission lỗi:", error);
      return { ok: false, error: dbErrorMessage(error) };
    }
    if (!data?.length) return { ok: false, error: "Không tìm thấy bài nộp hoặc bạn không phụ trách học sinh này." };
  } catch (err) {
    console.error("[homework] gradeSubmission lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }

  revalidateHomework();
  schedulePushDelivery();
  return { ok: true, data: null };
}
