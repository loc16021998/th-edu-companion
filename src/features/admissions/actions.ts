"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { formDataToObject, formError, formSuccess, zodFormError, type FormState } from "@/lib/form-state";
import { outboundConfig, sendOutbound } from "@/lib/messaging/outbound";
import { CAMPUS_LABELS } from "@/config/constants";
import { normalizeVietnamesePhone } from "@/features/auth/schema";
import { requireRole } from "@/features/auth/queries";
import { AccountError, createUserAccount, deleteUserAccount } from "@/features/admin/accounts";
import { schedulePushDelivery } from "@/features/push/deliver";
import { INVALID_ID, isUuid } from "@/lib/validation";
import type { ActionResult } from "@/types/action-result";
import { formatVND } from "@/lib/utils";
import { localPhone, programLabel, trialConfirmationText, trialWhen } from "./constants";
import {
  assessmentSchema,
  convertLeadSchema,
  leadSchema,
  leadStatusSchema,
  rescheduleSchema,
  trialSchema,
  trialStatusSchema,
  type AssessmentInput,
} from "./schema";

const CONNECTION_ERROR = "Không thể kết nối máy chủ. Vui lòng thử lại.";
const MIGRATION_MESSAGE = "Database chưa có bảng tuyển sinh — hãy chạy file supabase/apply-admissions.sql trong Supabase SQL Editor.";

function isMissing(code: string) {
  return ["PGRST205", "PGRST202", "42P01", "42703", "42883"].includes(code);
}

function revalidateAdmissions() {
  revalidatePath("/admin/admissions", "layout");
  revalidatePath("/teacher/trials");
}

function fail(scope: string, error: { code: string; message: string }): string {
  console.error(`[admissions] ${scope}:`, error);
  if (isMissing(error.code)) return MIGRATION_MESSAGE;
  return dbErrorMessage(error);
}

// ============================================================================= Học sinh tiềm năng

function leadRow(v: ReturnType<typeof leadSchema.parse>) {
  return {
    full_name: v.fullName,
    dob: v.dob,
    parent_name: v.parentName,
    phone: v.phone,
    target_program: v.targetProgram,
    campus: v.campus,
    source: v.source,
    notes: v.notes,
    follow_up_on: v.followUpOn,
    assigned_to: v.assignedTo,
  };
}

export async function createLead(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = leadSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFormError(parsed.error);
  await requireRole("admin");
  const v = parsed.data;

  try {
    const supabase = await createClient();
    // Cùng SĐT + cùng tên bé đang được tư vấn → tránh nhập trùng (anh chị em khác tên vẫn thêm được)
    const { data: dupes, error: dupError } = await supabase.from("leads").select("id, full_name, status").eq("phone", v.phone).neq("status", "lost");
    if (dupError) return formError(fail("createLead.dupes", dupError));
    const same = dupes.find((d) => d.full_name.trim().toLowerCase() === v.fullName.toLowerCase());
    if (same) return formError(`Bé ${same.full_name} (SĐT ${localPhone(v.phone)}) đã có trong danh sách tuyển sinh.`, { fullName: "Đã có trong danh sách" });

    const { error } = await supabase.from("leads").insert(leadRow(v));
    if (error) {
      if (error.code === "23514") return formError("Dữ liệu không hợp lệ (ngày sinh không được ở tương lai).");
      return formError(fail("createLead", error));
    }
  } catch (err) {
    console.error("[admissions] createLead lỗi:", err);
    return formError(CONNECTION_ERROR);
  }
  revalidateAdmissions();
  return formSuccess(`Đã thêm bé ${v.fullName} vào danh sách tuyển sinh.`);
}

export async function updateLead(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  if (!isUuid(id)) return formError(INVALID_ID);
  const parsed = leadSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFormError(parsed.error);
  await requireRole("admin");

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("leads").update(leadRow(parsed.data)).eq("id", id);
    if (error) return formError(fail("updateLead", error));
  } catch (err) {
    console.error("[admissions] updateLead lỗi:", err);
    return formError(CONNECTION_ERROR);
  }
  revalidateAdmissions();
  return formSuccess("Đã lưu thông tin.");
}

/** Đổi trạng thái tư vấn (kéo thả trên Kanban / chọn trong chi tiết). "Đã nhập học" chỉ qua chuyển đổi chính thức. */
export async function setLeadStatus(id: string, status: string, lostReason?: string): Promise<ActionResult<null>> {
  const parsed = leadStatusSchema.safeParse({ id, status, lostReason });
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ.",
    };
  await requireRole("admin");
  const v = parsed.data;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("leads")
      .update({
        status: v.status,
        lost_reason: v.status === "lost" ? v.lostReason : null,
      })
      .eq("id", v.id)
      .is("converted_student_id", null)
      .select("id");
    if (error) return { ok: false, error: fail("setLeadStatus", error) };
    if (data.length === 0)
      return {
        ok: false,
        error: "Bé đã nhập học chính thức — không đổi trạng thái được nữa.",
      };
  } catch (err) {
    console.error("[admissions] setLeadStatus lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateAdmissions();
  return { ok: true, data: null };
}

export async function deleteLead(id: string): Promise<ActionResult<null>> {
  if (!isUuid(id)) return { ok: false, error: INVALID_ID };
  await requireRole("admin");
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) return { ok: false, error: fail("deleteLead", error) };
  } catch (err) {
    console.error("[admissions] deleteLead lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateAdmissions();
  return { ok: true, data: null };
}

// ============================================================================= Lịch học thử

type ConfirmResult = {
  sent: boolean;
  message: string;
  text: string;
  phone: string;
};

/** Gửi tin xác nhận qua webhook Zalo ZNS / SMS (nếu đã cấu hình); luôn trả về nội dung để gửi tay khi cần. */
async function deliverConfirmation(trialId: string): Promise<ActionResult<ConfirmResult>> {
  const supabase = await createClient();
  const { data: t, error } = await supabase
    .from("trial_classes")
    .select("id, program, scheduled_at, campus, status, class:classes(name), lead:leads(parent_name, full_name, phone)")
    .eq("id", trialId)
    .maybeSingle();
  if (error) return { ok: false, error: fail("confirmation.load", error) };
  if (!t || !t.lead) return { ok: false, error: "Không tìm thấy buổi học thử." };
  if (t.status !== "scheduled") return { ok: false, error: "Buổi học thử không còn ở trạng thái chờ học." };

  const text = trialConfirmationText({
    parentName: t.lead.parent_name,
    childName: t.lead.full_name,
    program: t.program,
    scheduledAt: t.scheduled_at,
    campus: t.campus,
    className: t.class?.name,
  });
  const phone = t.lead.phone;
  const out = outboundConfig();
  if (!out.enabled) {
    return {
      ok: true,
      data: {
        sent: false,
        text,
        phone,
        message: "Chưa kết nối Zalo ZNS / SMS — sao chép tin nhắn hoặc bấm Gửi SMS để báo phụ huynh.",
      },
    };
  }

  const res = await sendOutbound({
    channels: out.channels,
    to: phone,
    template: "trial_booked",
    params: {
      parent_name: t.lead.parent_name,
      child_name: t.lead.full_name,
      program: programLabel(t.program),
      time: trialWhen(t.scheduled_at),
      campus: CAMPUS_LABELS[t.campus],
      class_name: t.class?.name ?? "",
      text,
    },
    idempotencyKey: `trial:${t.id}:${t.scheduled_at}`,
    meta: { trial_id: t.id },
  });
  await supabase
    .from("trial_classes")
    .update({
      confirmation_status: res.ok ? "sent" : "failed",
      confirmed_at: res.ok ? new Date().toISOString() : null,
    })
    .eq("id", t.id);
  return {
    ok: true,
    data: res.ok
      ? {
          sent: true,
          text,
          phone,
          message: `Đã gửi tin xác nhận tới ${localPhone(phone)}.`,
        }
      : {
          sent: false,
          text,
          phone,
          message: "Gửi tự động chưa thành công — sao chép tin nhắn hoặc bấm Gửi SMS để báo phụ huynh.",
        },
  };
}

export async function bookTrial(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = trialSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFormError(parsed.error);
  await requireRole("admin");
  const v = parsed.data;
  let note = "";

  try {
    const supabase = await createClient();
    const { data: lead } = await supabase.from("leads").select("id, full_name, converted_student_id").eq("id", v.leadId).maybeSingle();
    if (!lead)
      return formError("Không tìm thấy học sinh tiềm năng.", {
        leadId: "Vui lòng chọn lại",
      });
    if (lead.converted_student_id) return formError(`Bé ${lead.full_name} đã nhập học chính thức.`);

    const { data: trial, error } = await supabase
      .from("trial_classes")
      .insert({
        lead_id: v.leadId,
        scheduled_at: v.scheduledAt,
        duration_minutes: v.durationMinutes,
        campus: v.campus,
        program: v.program,
        class_id: v.classId,
        teacher_id: v.teacherId,
        note_for_teacher: v.noteForTeacher,
      })
      .select("id")
      .single();
    if (error) return formError(fail("bookTrial", error));

    if (v.sendConfirmation) {
      const res = await deliverConfirmation(trial.id);
      note = res.ok ? ` ${res.data.message}` : "";
    }
    note += v.teacherId ? " Giáo viên đã nhận thông báo." : "";
    note = `Đã xếp lịch học thử cho bé ${lead.full_name} lúc ${trialWhen(v.scheduledAt)}.${note}`;
  } catch (err) {
    console.error("[admissions] bookTrial lỗi:", err);
    return formError(CONNECTION_ERROR);
  }
  if (v.teacherId) schedulePushDelivery([v.teacherId]);
  revalidateAdmissions();
  return formSuccess(note);
}

export async function rescheduleTrial(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = rescheduleSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFormError(parsed.error);
  await requireRole("admin");
  const v = parsed.data;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("trial_classes")
      .update({
        scheduled_at: v.scheduledAt,
        duration_minutes: v.durationMinutes,
        campus: v.campus,
        program: v.program,
        class_id: v.classId,
        teacher_id: v.teacherId,
        note_for_teacher: v.noteForTeacher,
      })
      .eq("id", v.id)
      .eq("status", "scheduled");
    if (error) return formError(fail("rescheduleTrial", error));
  } catch (err) {
    console.error("[admissions] rescheduleTrial lỗi:", err);
    return formError(CONNECTION_ERROR);
  }
  if (v.teacherId) schedulePushDelivery([v.teacherId]);
  revalidateAdmissions();
  return formSuccess("Đã cập nhật lịch học thử. Nếu đổi giờ, nhớ gửi lại tin xác nhận cho phụ huynh.");
}

export async function setTrialStatus(id: string, status: string): Promise<ActionResult<null>> {
  const parsed = trialStatusSchema.safeParse({ id, status });
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ.",
    };
  await requireRole("admin");
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("trial_classes").update({ status: parsed.data.status }).eq("id", parsed.data.id);
    if (error) return { ok: false, error: fail("setTrialStatus", error) };
  } catch (err) {
    console.error("[admissions] setTrialStatus lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateAdmissions();
  return { ok: true, data: null };
}

export async function sendTrialConfirmation(id: string): Promise<ActionResult<ConfirmResult>> {
  if (!isUuid(id)) return { ok: false, error: INVALID_ID };
  await requireRole("admin");
  try {
    const res = await deliverConfirmation(id);
    if (res.ok) revalidateAdmissions();
    return res;
  } catch (err) {
    console.error("[admissions] sendTrialConfirmation lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
}

/** Tư vấn viên đã tự gọi / nhắn Zalo cho phụ huynh. */
export async function markTrialConfirmed(id: string): Promise<ActionResult<null>> {
  if (!isUuid(id)) return { ok: false, error: INVALID_ID };
  await requireRole("admin");
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("trial_classes")
      .update({
        confirmation_status: "manual",
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return { ok: false, error: fail("markTrialConfirmed", error) };
  } catch (err) {
    console.error("[admissions] markTrialConfirmed lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateAdmissions();
  return { ok: true, data: null };
}

/** Giáo viên (được phân công) hoặc quản trị viên gửi đánh giá nhanh sau buổi học thử. Quyền kiểm tra trong RPC. */
export async function submitTrialAssessment(input: AssessmentInput): Promise<ActionResult<null>> {
  const parsed = assessmentSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ.",
    };
  await requireRole("teacher", "admin");
  const v = parsed.data;

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("submit_trial_assessment", {
      p_trial: v.trialId,
      p_attended: v.attended,
      p_level: v.level,
      p_skills: v.skills,
      p_strengths: v.strengths,
      p_improvements: v.improvements,
      p_recommendation: v.recommendation,
    });
    if (error) {
      console.error("[admissions] submitTrialAssessment lỗi:", error);
      if (isMissing(error.code)) return { ok: false, error: MIGRATION_MESSAGE };
      if (error.code === "42501" || error.code === "22023" || error.code === "P0002") return { ok: false, error: error.message };
      return { ok: false, error: dbErrorMessage(error) };
    }
  } catch (err) {
    console.error("[admissions] submitTrialAssessment lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateAdmissions();
  return { ok: true, data: null };
}

// ============================================================================= Chuyển thành học viên chính thức

export type ParentMatch = {
  id: string;
  full_name: string;
  phone: string | null;
  children: string[];
};

/** Tài khoản phụ huynh sẵn có cùng SĐT (vd. đã có anh/chị học tại trung tâm) → gợi ý dùng lại thay vì tạo mới. */
export async function findParentsByPhone(phone: string): Promise<ActionResult<ParentMatch[]>> {
  await requireRole("admin");
  const e164 = normalizeVietnamesePhone(phone);
  if (!e164) return { ok: true, data: [] };
  const national = e164.slice(3);
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, phone, children:students!students_parent_id_fkey(full_name)")
      .eq("role", "parent")
      .in("phone", [e164, `84${national}`, `0${national}`]);
    if (error) return { ok: false, error: fail("findParentsByPhone", error) };
    return {
      ok: true,
      data: data.map((p) => ({
        id: p.id,
        full_name: p.full_name,
        phone: p.phone,
        children: p.children.map((c) => c.full_name),
      })),
    };
  } catch (err) {
    console.error("[admissions] findParentsByPhone lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
}

export async function convertLead(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = formDataToObject(formData);
  const parsed = convertLeadSchema.safeParse({
    ...raw,
    subjects: formData.getAll("subjects"),
  });
  if (!parsed.success) return zodFormError(parsed.error);
  await requireRole("admin");
  const v = parsed.data;

  let createdParentId: string | null = null;
  let message: string;
  try {
    const supabase = await createClient();
    const [{ data: lead }, { data: cls }] = await Promise.all([
      supabase.from("leads").select("id, full_name, converted_student_id").eq("id", v.leadId).maybeSingle(),
      supabase.from("classes").select("id, campus, name").eq("id", v.classId).maybeSingle(),
    ]);
    if (!lead) return formError("Không tìm thấy học sinh tiềm năng.");
    if (lead.converted_student_id) return formError(`Bé ${lead.full_name} đã là học viên chính thức.`);
    if (!cls)
      return formError("Lớp không tồn tại.", {
        classId: "Vui lòng chọn lại lớp",
      });

    // 1) Tài khoản phụ huynh: dùng lại tài khoản sẵn có, hoặc tạo mới (Supabase Auth, service role — chỉ ở server)
    let parentId = v.parentId;
    const parentPhone = normalizeVietnamesePhone(v.parentPhone);
    if (v.parentMode === "new") {
      try {
        createdParentId = await createUserAccount(
          {
            fullName: v.parentFullName,
            phone: parentPhone,
            email: v.parentEmail,
            password: v.parentPassword,
          },
          "parent",
          cls.campus,
        );
      } catch (err) {
        if (err instanceof AccountError) {
          const hint = /đã có tài khoản/.test(err.message) ? " Chọn “Dùng tài khoản phụ huynh sẵn có” để gắn bé vào tài khoản đó." : "";
          return formError(err.message + hint, { parentPhone: err.message });
        }
        throw err;
      }
      parentId = createdParentId;
    }

    // 2) Học sinh + khoản học phí đầu tiên + đánh dấu lead "Đã nhập học" — 1 giao dịch trong DB
    const { error } = await supabase.rpc("convert_lead_to_student", {
      p_lead: v.leadId,
      p_parent: parentId!,
      p_class: v.classId,
      p_full_name: v.fullName,
      p_dob: v.dob,
      p_subjects: v.subjects,
      p_fee_title: v.feeTitle,
      p_fee_amount: v.feeAmount,
      p_fee_due: v.feeDueDate,
    });
    if (error) {
      if (createdParentId) await deleteUserAccount(createdParentId).catch((e) => console.error("[admissions] Hoàn tác tài khoản phụ huynh lỗi:", e));
      createdParentId = null;
      console.error("[admissions] convert_lead_to_student lỗi:", error);
      if (isMissing(error.code)) return formError(MIGRATION_MESSAGE);
      if (["23505", "22023", "42501", "P0002"].includes(error.code)) return formError(error.message);
      if (error.code === "23514") return formError("Dữ liệu học sinh không hợp lệ (kiểm tra ngày sinh, môn đăng ký).");
      return formError(dbErrorMessage(error));
    }

    const login =
      v.parentMode === "new"
        ? ` Phụ huynh đăng nhập bằng SĐT ${localPhone(parentPhone ?? "")} và mật khẩu vừa đặt.`
        : " Đã gắn vào tài khoản phụ huynh sẵn có.";
    message = `Bé ${v.fullName} đã là học viên chính thức lớp ${cls.name}. Đã tạo khoản “${v.feeTitle}” (${formatVND(v.feeAmount)}).${login}`;
  } catch (err) {
    if (createdParentId) await deleteUserAccount(createdParentId).catch((e) => console.error("[admissions] Hoàn tác tài khoản phụ huynh lỗi:", e));
    console.error("[admissions] convertLead lỗi:", err);
    return formError(CONNECTION_ERROR);
  }

  // Thông báo học phí mới → phụ huynh (Web Push / Zalo nếu bật)
  schedulePushDelivery();
  revalidateTag(CACHE_TAGS.students);
  revalidatePath("/admin", "layout");
  revalidatePath("/parent", "layout");
  revalidatePath("/teacher", "layout");
  return formSuccess(message);
}
