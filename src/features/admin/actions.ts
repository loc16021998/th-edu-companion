"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import type { PostgrestError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { formDataToObject, formError, formSuccess, zodFormError, type FormState } from "@/lib/form-state";
import { formatVND } from "@/lib/utils";
import { requireRole } from "@/features/auth/queries";
import { INVALID_ID, isUuid } from "@/lib/validation";
import type { ActionResult } from "@/types/action-result";
import { schedulePushDelivery } from "@/features/push/deliver";
import { AccountError, createUserAccount, deleteUserAccount, resetUserPassword } from "./accounts";
import {
  accountSchema,
  assignTeacherSchema,
  createClassSchema,
  createFeeSchema,
  createStudentSchema,
  createAccountSchema,
  recordPaymentSchema,
  resetPasswordSchema,
  saveTeacherAttendanceSchema,
  studentSubjectsSchema,
  type SaveTeacherAttendanceInput,
} from "./schema";

const CONNECTION_ERROR = "Không thể kết nối máy chủ. Vui lòng thử lại.";

function revalidateAll() {
  // Danh sách học sinh / con của phụ huynh (cache) — thêm, sửa, chuyển lớp, xoá, đổi phụ huynh
  revalidateTag(CACHE_TAGS.students);
  revalidatePath("/admin", "layout");
  revalidatePath("/teacher", "layout");
  revalidatePath("/parent", "layout");
}

function logAndMessage(scope: string, error: PostgrestError): string {
  console.error(`[admin] ${scope}:`, error);
  return dbErrorMessage(error);
}

// ============================================================================= Lớp học

export async function createClass(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = createClassSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFormError(parsed.error);
  await requireRole("admin");
  const { campus, name, teacherId, shiftId } = parsed.data;

  try {
    const supabase = await createClient();
    // Chỉ gửi shift_id khi có chọn ca (DB chưa chạy migration ca học vẫn tạo lớp được)
    const { error } = await supabase.from("classes").insert({ campus, name, ...(shiftId && { shift_id: shiftId }) });
    if (error) {
      if (error.code === "23505") return formError("Lớp này đã có ở cơ sở đã chọn.", { name: "Tên lớp bị trùng" });
      return formError(logAndMessage("createClass", error));
    }
    if (teacherId) {
      const { error: assignError } = await supabase
        .from("teacher_assignments")
        .insert({ teacher_id: teacherId, campus, class_name: name });
      if (assignError) return formError(`Đã tạo lớp ${name}, nhưng chưa phân công được giáo viên. Vui lòng thử lại.`);
    }
  } catch (err) {
    console.error("[admin] createClass lỗi:", err);
    return formError(CONNECTION_ERROR);
  }

  revalidateAll();
  return formSuccess(`Đã tạo lớp ${name}.`);
}

/** Đổi giáo viên chủ nhiệm của lớp (thay toàn bộ phân công riêng của lớp). teacherId null = bỏ phân công. */
export async function assignClassTeacher(classId: string, teacherId: string | null): Promise<ActionResult<null>> {
  const parsed = assignTeacherSchema.safeParse({ classId, teacherId: teacherId ?? "" });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  await requireRole("admin");

  try {
    const supabase = await createClient();
    const { data: cls, error } = await supabase.from("classes").select("campus, name").eq("id", parsed.data.classId).single();
    if (error) return { ok: false, error: "Không tìm thấy lớp." };

    const { error: delError } = await supabase
      .from("teacher_assignments")
      .delete()
      .eq("campus", cls.campus)
      .eq("class_name", cls.name);
    if (delError) return { ok: false, error: logAndMessage("assignClassTeacher.delete", delError) };

    if (parsed.data.teacherId) {
      const { error: insError } = await supabase
        .from("teacher_assignments")
        .insert({ teacher_id: parsed.data.teacherId, campus: cls.campus, class_name: cls.name });
      if (insError) return { ok: false, error: logAndMessage("assignClassTeacher.insert", insError) };
    }
  } catch (err) {
    console.error("[admin] assignClassTeacher lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }

  revalidateAll();
  return { ok: true, data: null };
}

export async function deleteClass(classId: string): Promise<ActionResult<null>> {
  if (!isUuid(classId)) return { ok: false, error: INVALID_ID };
  await requireRole("admin");
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("classes").delete().eq("id", classId);
    if (error) {
      // FK students → classes ON DELETE RESTRICT
      if (error.code === "23503") return { ok: false, error: "Lớp còn học sinh — hãy chuyển hoặc xoá học sinh trước." };
      return { ok: false, error: logAndMessage("deleteClass", error) };
    }
  } catch (err) {
    console.error("[admin] deleteClass lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateAll();
  return { ok: true, data: null };
}

// ============================================================================= Tài khoản

const ROLE_NAME = { parent: "phụ huynh", teacher: "giáo viên" } as const;

/** Admin tạo tài khoản đăng nhập cho phụ huynh hoặc giáo viên (không có tự đăng ký). */
export async function createAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = createAccountSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFormError(parsed.error);
  await requireRole("admin");
  const v = parsed.data;

  try {
    await createUserAccount(v, v.role, v.campus);
  } catch (err) {
    if (err instanceof AccountError) return formError(err.message);
    console.error("[admin] createAccount lỗi:", err);
    return formError(CONNECTION_ERROR);
  }
  revalidateAll();
  const login = [v.phone ? `SĐT ${v.phone.replace(/^\+84/, "0")}` : null, v.email].filter(Boolean).join(" hoặc ");
  return formSuccess(`Đã tạo tài khoản ${ROLE_NAME[v.role]} ${v.fullName}. Đăng nhập bằng ${login} và mật khẩu vừa đặt.`);
}

export async function resetAccountPassword(userId: string, password: string): Promise<ActionResult<null>> {
  const parsed = resetPasswordSchema.safeParse({ userId, password });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  await requireRole("admin");
  try {
    await resetUserPassword(parsed.data.userId, parsed.data.password);
  } catch (err) {
    if (err instanceof AccountError) return { ok: false, error: err.message };
    console.error("[admin] resetAccountPassword lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  return { ok: true, data: null };
}

export async function deleteAccount(userId: string): Promise<ActionResult<null>> {
  if (!isUuid(userId)) return { ok: false, error: INVALID_ID };
  const profile = await requireRole("admin");
  if (userId === profile.id) return { ok: false, error: "Không thể xoá tài khoản đang đăng nhập." };
  try {
    await deleteUserAccount(userId);
  } catch (err) {
    if (err instanceof AccountError) return { ok: false, error: err.message };
    console.error("[admin] deleteAccount lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateAll();
  return { ok: true, data: null };
}

// ============================================================================= Học sinh

export async function createStudent(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = formDataToObject(formData);
  // Môn đăng ký là nhiều ô tick cùng tên → lấy đủ danh sách
  const parsed = createStudentSchema.safeParse({ ...raw, subjects: formData.getAll("subjects") });
  if (!parsed.success) return zodFormError(parsed.error);
  await requireRole("admin");
  const v = parsed.data;

  try {
    const supabase = await createClient();
    const { data: cls, error: clsError } = await supabase.from("classes").select("campus, name").eq("id", v.classId).maybeSingle();
    if (clsError) return formError(logAndMessage("createStudent.class", clsError));
    if (!cls) return formError("Lớp không tồn tại.", { classId: "Vui lòng chọn lại lớp" });

    let parentId: string | null = null;
    if (v.parentMode === "existing") {
      const { data: parent } = await supabase.from("profiles").select("id, role").eq("id", v.parentId ?? "").maybeSingle();
      if (parent?.role !== "parent") return formError("Phụ huynh không hợp lệ.", { parentId: "Vui lòng chọn lại phụ huynh" });
      parentId = parent.id;
    } else if (v.parentMode === "new") {
      const account = accountSchema.safeParse({
        fullName: raw.parentFullName,
        email: raw.parentEmail,
        phone: raw.parentPhone,
        password: raw.parentPassword,
      });
      if (!account.success) {
        const issue = account.error.issues[0];
        const field = { fullName: "parentFullName", email: "parentEmail", phone: "parentPhone", password: "parentPassword" }[
          String(issue?.path[0] ?? "")
        ];
        return formError(issue?.message ?? "Thông tin phụ huynh không hợp lệ.", field ? { [field]: issue?.message ?? "" } : undefined);
      }
      parentId = await createUserAccount(account.data, "parent", cls.campus);
    }

    const { error } = await supabase.from("students").insert({
      full_name: v.fullName,
      dob: v.dob,
      campus: cls.campus,
      class_name: cls.name,
      parent_id: parentId,
      subjects: v.subjects,
    });
    if (error) {
      if (error.code === "PGRST204" || error.code === "42703") {
        return formError("Database chưa có cột môn đăng ký — hãy chạy file supabase/apply-student-subjects.sql.");
      }
      if (error.code === "23514") return formError("Ngày sinh không hợp lệ (không được ở tương lai).", { dob: "Ngày sinh không hợp lệ" });
      return formError(logAndMessage("createStudent", error));
    }
  } catch (err) {
    if (err instanceof AccountError) return formError(err.message);
    console.error("[admin] createStudent lỗi:", err);
    return formError(CONNECTION_ERROR);
  }

  revalidateAll();
  return formSuccess(`Đã thêm học sinh ${v.fullName}.`);
}

/** Sửa môn đăng ký của học sinh (chỉ quản trị viên — RLS admin_all_students). */
export async function updateStudentSubjects(studentId: string, subjects: string[]): Promise<ActionResult<null>> {
  const parsed = studentSubjectsSchema.safeParse(subjects);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  if (!z.string().uuid().safeParse(studentId).success) return { ok: false, error: "Học sinh không hợp lệ." };
  await requireRole("admin");
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("students").update({ subjects: parsed.data }).eq("id", studentId);
    if (error) {
      if (error.code === "PGRST204" || error.code === "42703") {
        return { ok: false, error: "Database chưa có cột môn đăng ký — hãy chạy file supabase/apply-student-subjects.sql." };
      }
      return { ok: false, error: logAndMessage("updateStudentSubjects", error) };
    }
  } catch (err) {
    console.error("[admin] updateStudentSubjects lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateAll();
  return { ok: true, data: null };
}

export async function deleteStudent(studentId: string): Promise<ActionResult<null>> {
  if (!isUuid(studentId)) return { ok: false, error: INVALID_ID };
  await requireRole("admin");
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("students").delete().eq("id", studentId);
    if (error) return { ok: false, error: logAndMessage("deleteStudent", error) };
  } catch (err) {
    console.error("[admin] deleteStudent lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateAll();
  return { ok: true, data: null };
}

// ============================================================================= Học phí

export async function createFee(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = createFeeSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFormError(parsed.error);
  await requireRole("admin");
  const v = parsed.data;

  let count = 0;
  try {
    const supabase = await createClient();
    let studentIds: string[];
    if (v.target === "student") {
      studentIds = [v.studentId ?? ""];
    } else {
      const { data: cls } = await supabase.from("classes").select("campus, name").eq("id", v.classId ?? "").maybeSingle();
      if (!cls) return formError("Lớp không tồn tại.", { classId: "Vui lòng chọn lại lớp" });
      const { data: students, error } = await supabase
        .from("students")
        .select("id")
        .eq("campus", cls.campus)
        .eq("class_name", cls.name);
      if (error) return formError(logAndMessage("createFee.students", error));
      studentIds = students.map((s) => s.id);
      if (studentIds.length === 0) return formError("Lớp chưa có học sinh nào.", { classId: "Lớp chưa có học sinh" });
    }

    const { error } = await supabase
      .from("fees")
      .insert(studentIds.map((id) => ({ student_id: id, title: v.title, amount: v.amount, due_date: v.dueDate })));
    if (error) return formError(logAndMessage("createFee", error));
    count = studentIds.length;
  } catch (err) {
    console.error("[admin] createFee lỗi:", err);
    return formError(CONNECTION_ERROR);
  }

  revalidateAll();
  schedulePushDelivery();
  return formSuccess(
    count > 1 ? `Đã tạo khoản "${v.title}" (${formatVND(v.amount)}) cho ${count} học sinh.` : `Đã tạo khoản "${v.title}" (${formatVND(v.amount)}).`,
  );
}

/** Ghi nhận số tiền đã đóng (trạng thái Chưa đóng / Còn thiếu / Đã thanh toán do trigger DB tự tính). */
export async function recordPayment(feeId: string, paidAmount: number): Promise<ActionResult<null>> {
  const parsed = recordPaymentSchema.safeParse({ feeId, paidAmount });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  await requireRole("admin");

  try {
    const supabase = await createClient();
    const { data: fee } = await supabase.from("fees").select("amount").eq("id", parsed.data.feeId).maybeSingle();
    if (!fee) return { ok: false, error: "Không tìm thấy khoản thu." };
    if (parsed.data.paidAmount > fee.amount) {
      return { ok: false, error: `Số tiền đã đóng không được vượt quá ${formatVND(fee.amount)}.` };
    }
    const { error } = await supabase.from("fees").update({ paid_amount: parsed.data.paidAmount }).eq("id", parsed.data.feeId);
    if (error) return { ok: false, error: logAndMessage("recordPayment", error) };
  } catch (err) {
    console.error("[admin] recordPayment lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }

  revalidateAll();
  return { ok: true, data: null };
}

export async function deleteFee(feeId: string): Promise<ActionResult<null>> {
  if (!isUuid(feeId)) return { ok: false, error: INVALID_ID };
  await requireRole("admin");
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("fees").delete().eq("id", feeId);
    if (error) return { ok: false, error: logAndMessage("deleteFee", error) };
  } catch (err) {
    console.error("[admin] deleteFee lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateAll();
  return { ok: true, data: null };
}

// ============================================================================= Chấm công giáo viên

export async function saveTeacherAttendance(input: SaveTeacherAttendanceInput): Promise<ActionResult<{ saved: number }>> {
  const parsed = saveTeacherAttendanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu chấm công không hợp lệ." };
  const profile = await requireRole("admin");
  const { date, records } = parsed.data;

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("teacher_attendance").upsert(
      records.map((r) => ({
        teacher_id: r.teacherId,
        date,
        status: r.status,
        note: r.note || null,
        recorded_by: profile.id,
      })),
      { onConflict: "teacher_id,date" },
    );
    if (error) return { ok: false, error: logAndMessage("saveTeacherAttendance", error) };
  } catch (err) {
    console.error("[admin] saveTeacherAttendance lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }

  revalidatePath("/admin", "layout");
  revalidatePath("/teacher", "layout");
  return { ok: true, data: { saved: records.length } };
}
