"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { formDataToObject, formError, formSuccess, zodFormError, type FormState } from "@/lib/form-state";
import { normalizeVietnamesePhone } from "@/features/auth/schema";
import { requireRole } from "@/features/auth/queries";
import { INVALID_ID, isUuid } from "@/lib/validation";
import { AccountError, createUserAccount, deleteUserAccount, updateUserLogin } from "@/features/admin/accounts";
import type { ActionResult } from "@/types/action-result";
import { schedulePushDelivery } from "@/features/push/deliver";
import { AUDIENCE_LABEL, CAMPUS_LIST, feeAfterExcused, monthLabel, perSessionPrice, previousMonth, type Campus } from "./constants";
import { countExcusedSessions } from "./queries";
import {
  announcementSchema,
  createTeacherSchema,
  generateFeesSchema,
  updateStudentSchema,
  updateTeacherSchema,
  type GenerateFeesInput,
  type UpdateStudentInput,
  type UpdateTeacherInput,
} from "./schema";

const CONNECTION_ERROR = "Không thể kết nối máy chủ. Vui lòng thử lại.";
const MIGRATION_HINT = "Database chưa cập nhật — hãy chạy file supabase/apply-admin-center.sql trong Supabase SQL Editor.";

function revalidateAll() {
  // Danh sách học sinh / con của phụ huynh (cache) — thêm, sửa, chuyển lớp, xoá, đổi phụ huynh
  revalidateTag(CACHE_TAGS.students);
  revalidatePath("/admin", "layout");
  revalidatePath("/teacher", "layout");
  revalidatePath("/parent", "layout");
}

function fail(scope: string, error: { code?: string; message: string }): ActionResult<never> {
  if (error.code === "PGRST205" || error.code === "PGRST204" || error.code === "42703" || error.code === "42P01") return { ok: false, error: MIGRATION_HINT };
  console.error(`[center] ${scope}:`, error);
  return { ok: false, error: dbErrorMessage(error as Parameters<typeof dbErrorMessage>[0]) };
}

/** Phân công mới = các cơ sở xem toàn bộ + các lớp lẻ (bỏ lớp đã nằm trong cơ sở toàn quyền). */
async function buildAssignments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teacherId: string,
  campusWide: Campus[],
  classIds: string[],
) {
  const rows: { teacher_id: string; campus: Campus; class_name: string | null }[] = [...new Set(campusWide)].map((campus) => ({
    teacher_id: teacherId,
    campus,
    class_name: null,
  }));
  if (classIds.length) {
    const { data, error } = await supabase.from("classes").select("campus, name").in("id", classIds);
    if (error) throw error;
    for (const c of data) if (!campusWide.includes(c.campus)) rows.push({ teacher_id: teacherId, campus: c.campus, class_name: c.name });
  }
  return rows;
}

// ============================================================================ Giáo viên

export async function createTeacher(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = createTeacherSchema.safeParse({
    ...formDataToObject(formData),
    campusWide: formData.getAll("campusWide"),
    classIds: formData.getAll("classIds"),
  });
  if (!parsed.success) return zodFormError(parsed.error);
  await requireRole("admin");
  const v = parsed.data;

  try {
    const teacherId = await createUserAccount(v, "teacher", v.campus);
    const supabase = await createClient();
    const rows = await buildAssignments(supabase, teacherId, v.campusWide, v.classIds);
    if (rows.length) {
      const { error } = await supabase.from("teacher_assignments").insert(rows);
      if (error) return formError(`Đã tạo tài khoản ${v.fullName}, nhưng chưa phân lớp được — hãy phân lớp lại trong danh sách.`);
    }
  } catch (err) {
    if (err instanceof AccountError) return formError(err.message);
    console.error("[center] createTeacher lỗi:", err);
    return formError(CONNECTION_ERROR);
  }
  revalidateAll();
  const login = [v.phone ? `SĐT ${v.phone.replace(/^\+84/, "0")}` : null, v.email].filter(Boolean).join(" hoặc ");
  return formSuccess(`Đã tạo tài khoản giáo viên ${v.fullName}. Đăng nhập bằng ${login} và mật khẩu vừa đặt.`);
}

/** Sửa họ tên, cơ sở chính và phân công (thay toàn bộ phân công cũ). */
export async function updateTeacher(input: UpdateTeacherInput): Promise<ActionResult<null>> {
  const parsed = updateTeacherSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  await requireRole("admin");
  const v = parsed.data;

  try {
    const supabase = await createClient();
    const { data: profile } = await supabase.from("profiles").select("role, phone").eq("id", v.teacherId).maybeSingle();
    if (profile?.role !== "teacher") return { ok: false, error: "Không tìm thấy giáo viên." };

    // Đổi SĐT / email đăng nhập (chỉ khi khác hiện tại) — cần service role
    const samePhone = v.phone && profile.phone && phoneVariants(v.phone).includes(profile.phone);
    const login = { phone: samePhone ? undefined : v.phone, email: v.email };
    if (login.phone || login.email) {
      try {
        await updateUserLogin(v.teacherId, login);
      } catch (err) {
        if (err instanceof AccountError) return { ok: false, error: err.message };
        throw err;
      }
    }

    const { error: profileError } = await supabase.from("profiles").update({ full_name: v.fullName, campus: v.campus }).eq("id", v.teacherId);
    if (profileError) return fail("updateTeacher.profile", profileError);

    const rows = await buildAssignments(supabase, v.teacherId, v.campusWide, v.classIds);
    const { error: delError } = await supabase.from("teacher_assignments").delete().eq("teacher_id", v.teacherId);
    if (delError) return fail("updateTeacher.delete", delError);
    if (rows.length) {
      const { error } = await supabase.from("teacher_assignments").insert(rows);
      if (error) return fail("updateTeacher.insert", error);
    }
  } catch (err) {
    console.error("[center] updateTeacher lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateAll();
  return { ok: true, data: null };
}

export async function deleteTeacher(teacherId: string): Promise<ActionResult<null>> {
  if (!isUuid(teacherId)) return { ok: false, error: INVALID_ID };
  await requireRole("admin");
  try {
    await deleteUserAccount(teacherId);
  } catch (err) {
    if (err instanceof AccountError) return { ok: false, error: err.message };
    console.error("[center] deleteTeacher lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateAll();
  return { ok: true, data: null };
}

// ============================================================================ Học sinh

/** SĐT có thể lưu dạng +84…, 84… hoặc 0… — so khớp cả 3. */
function phoneVariants(phone: string) {
  const national = phone.replace(/^\+84/, "");
  return [`+84${national}`, `84${national}`, `0${national}`];
}

/** Tìm tài khoản phụ huynh theo số điện thoại (để liên kết với học sinh). */
export async function findParentByPhone(raw: string): Promise<ActionResult<{ id: string; full_name: string } | null>> {
  if (typeof raw !== "string" || raw.length > 30) return { ok: false, error: "Số điện thoại không hợp lệ (vd: 0912 345 678)." };
  await requireRole("admin");
  const phone = normalizeVietnamesePhone(raw);
  if (!phone) return { ok: false, error: "Số điện thoại không hợp lệ (vd: 0912 345 678)." };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("profiles").select("id, full_name, role").in("phone", phoneVariants(phone));
    if (error) return fail("findParentByPhone", error);
    const parent = data.find((p) => p.role === "parent");
    if (!parent && data.length) return { ok: false, error: "Số điện thoại này thuộc tài khoản giáo viên / quản trị, không phải phụ huynh." };
    return { ok: true, data: parent ? { id: parent.id, full_name: parent.full_name } : null };
  } catch (err) {
    console.error("[center] findParentByPhone lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
}

/** Sửa thông tin học sinh: họ tên, ngày sinh, CHUYỂN LỚP, liên kết phụ huynh qua SĐT. */
export async function updateStudent(input: UpdateStudentInput): Promise<ActionResult<{ parentName: string | null }>> {
  const parsed = updateStudentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  await requireRole("admin");
  const v = parsed.data;

  let parentId: string | null = null;
  let parentName: string | null = null;
  if (v.parentPhone) {
    const found = await findParentByPhone(v.parentPhone);
    if (!found.ok) return found;
    if (!found.data) return { ok: false, error: "Chưa có tài khoản phụ huynh với SĐT này — hãy tạo tài khoản ở mục Cấp tài khoản trước." };
    parentId = found.data.id;
    parentName = found.data.full_name;
  }

  try {
    const supabase = await createClient();
    const { data: cls } = await supabase.from("classes").select("campus, name").eq("id", v.classId).maybeSingle();
    if (!cls) return { ok: false, error: "Lớp không tồn tại." };
    const { error } = await supabase
      .from("students")
      .update({ full_name: v.fullName, dob: v.dob, campus: cls.campus, class_name: cls.name, parent_id: parentId })
      .eq("id", v.studentId);
    if (error) {
      if (error.code === "23514") return { ok: false, error: "Ngày sinh không hợp lệ (không được ở tương lai)." };
      return fail("updateStudent", error);
    }
  } catch (err) {
    console.error("[center] updateStudent lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateAll();
  return { ok: true, data: { parentName } };
}

// ============================================================================ Tạo học phí tháng (1 cú click)

/**
 * Tạo khoản học phí của kỳ `month` cho mọi học sinh trong các lớp đã chọn.
 * Bé đã có khoản của kỳ này được bỏ qua (unique student_id + period) → bấm lại không tạo trùng.
 * Mỗi khoản mới → phụ huynh nhận thông báo (trigger fees_issued_notify).
 */
export async function generateMonthlyFees(input: GenerateFeesInput): Promise<ActionResult<{ created: number; skipped: number; deducted: number; total: number }>> {
  const parsed = generateFeesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  await requireRole("admin");
  const v = parsed.data;

  try {
    const supabase = await createClient();
    const amountByClass = new Map(v.items.map((i) => [i.classId, i.amount]));
    const { data: classes, error: clsError } = await supabase.from("classes").select("id, campus, name").in("id", [...amountByClass.keys()]);
    if (clsError) return fail("generateMonthlyFees.classes", clsError);

    const { data: students, error: stError } = await supabase.from("students").select("id, campus, class_name").in("campus", CAMPUS_LIST);
    if (stError) return fail("generateMonthlyFees.students", stError);
    const { data: issued, error: issuedError } = await supabase.from("fees").select("student_id").eq("period", v.month).limit(10000);
    if (issuedError) return fail("generateMonthlyFees.issued", issuedError);
    const already = new Set(issued.map((f) => f.student_id));

    // Trừ buổi "Nghỉ có phép" (đơn xin nghỉ được duyệt) của THÁNG TRƯỚC — đếm lại ở server
    const prev = previousMonth(v.month);
    const excused = v.deductExcused ? await countExcusedSessions(supabase, prev) : new Map<string, number>();

    const rows: { student_id: string; title: string; amount: number; due_date: string | null; period: string }[] = [];
    let skipped = 0;
    let deducted = 0;
    for (const c of classes) {
      const amount = amountByClass.get(c.id)!;
      const perSession = v.deductExcused ? (v.deductExcused.perSession ?? perSessionPrice(amount, prev)) : 0;
      for (const s of students) {
        if (s.campus !== c.campus || s.class_name !== c.name) continue;
        if (already.has(s.id)) {
          skipped += 1;
          continue;
        }
        const sessions = excused.get(s.id) ?? 0;
        const final = feeAfterExcused(amount, sessions, perSession);
        if (sessions && perSession) deducted += 1;
        if (final <= 0) {
          skipped += 1; // nghỉ có phép cả tháng → không phát sinh học phí
          continue;
        }
        rows.push({
          student_id: s.id,
          title: sessions && perSession ? `${v.title} (đã trừ ${sessions} buổi nghỉ có phép tháng ${monthLabel(prev)})`.slice(0, 120) : v.title,
          amount: final,
          due_date: v.dueDate,
          period: v.month,
        });
      }
    }

    let created = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { data, error } = await supabase
        .from("fees")
        .upsert(chunk, { onConflict: "student_id,period", ignoreDuplicates: true })
        .select("id");
      if (error) return fail("generateMonthlyFees.insert", error);
      created += data.length;
    }
    skipped += rows.length - created;

    if (v.saveDefaults) {
      await Promise.all(v.items.map((i) => supabase.from("classes").update({ monthly_fee: i.amount }).eq("id", i.classId)));
    }

    revalidateAll();
    schedulePushDelivery();
    return { ok: true, data: { created, skipped, deducted, total: rows.reduce((sum, r) => sum + r.amount, 0) } };
  } catch (err) {
    console.error("[center] generateMonthlyFees lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
}

// ============================================================================ Thông báo chung

export async function createAnnouncement(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = announcementSchema.safeParse({ ...formDataToObject(formData), classIds: formData.getAll("classIds") });
  if (!parsed.success) return zodFormError(parsed.error);
  const profile = await requireRole("admin");
  const v = parsed.data;
  const campus = v.audience === "CS1_XALA" || v.audience === "CS2_NGOTHINHAM" ? v.audience : null;

  let recipients = 0;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("announcements")
      .insert({
        title: v.title,
        body: v.body,
        category: v.category,
        audience: campus ? "campus" : v.audience,
        campus,
        class_ids: v.audience === "classes" ? v.classIds : [],
        created_by: profile.id,
      })
      .select("recipient_count")
      .single();
    if (error) {
      const res = fail("createAnnouncement", error);
      return formError(res.ok ? "" : res.error);
    }
    recipients = data.recipient_count;
  } catch (err) {
    console.error("[center] createAnnouncement lỗi:", err);
    return formError(CONNECTION_ERROR);
  }
  revalidateAll();
  schedulePushDelivery();
  return formSuccess(
    recipients > 0
      ? `Đã đăng "${v.title}" — gửi tới ${recipients} phụ huynh (${AUDIENCE_LABEL[v.audience].toLowerCase()}).`
      : `Đã đăng "${v.title}", nhưng chưa có phụ huynh nào thuộc nhóm nhận (chưa liên kết tài khoản).`,
  );
}

export async function deleteAnnouncement(id: string): Promise<ActionResult<null>> {
  if (!isUuid(id)) return { ok: false, error: INVALID_ID };
  await requireRole("admin");
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (error) return fail("deleteAnnouncement", error);
  } catch (err) {
    console.error("[center] deleteAnnouncement lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateAll();
  return { ok: true, data: null };
}

