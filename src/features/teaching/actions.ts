"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { isISODate } from "@/lib/date";
import { requireRole } from "@/features/auth/queries";
import { INVALID_ID, isUuid } from "@/lib/validation";
import type { ActionResult } from "@/types/action-result";
import { PAY_SUBJECT_KEYS, type PaySubject } from "./constants";
import { isMissing } from "./queries";

const CONNECTION_ERROR = "Không thể kết nối máy chủ. Vui lòng thử lại.";
const MIGRATION_MESSAGE = "Database chưa có bảng chấm công theo ca — hãy chạy file supabase/apply-teaching-payroll.sql trong Supabase SQL Editor.";

function revalidateTeaching() {
  // Sĩ số tối đa / môn của lớp đổi → báo cáo phân tích (cache 10 phút) tính lại
  revalidateTag("analytics");
  revalidatePath("/teacher/schedule");
  revalidatePath("/teacher/dashboard");
  revalidatePath("/admin/payroll", "layout");
  revalidatePath("/admin/teacher-attendance");
}

/** Lỗi do RPC tự báo (thông điệp tiếng Việt đã rõ) → trả nguyên văn; còn lại → thông báo chung. */
function rpcError(scope: string, error: { code: string; message: string; hint?: string | null }): string {
  console.error(`[teaching] ${scope}:`, error);
  if (isMissing(error)) return MIGRATION_MESSAGE;
  if (["42501", "22023", "23505", "P0001", "P0002"].includes(error.code)) return error.message;
  return dbErrorMessage(error);
}

// ============================================================================= Giáo viên

/** "Bắt đầu ca dạy". `note` bắt buộc khi ngoài giờ ca (dạy bù / đổi ca) — DB trả hint "need_note". */
export async function startTeachingSession(classId: string, note?: string): Promise<ActionResult<{ id: string }> & { needNote?: boolean }> {
  if (!isUuid(classId)) return { ok: false, error: INVALID_ID };
  const reason = z.string().trim().max(300, "Lý do tối đa 300 ký tự").optional().safeParse(note);
  if (!reason.success) return { ok: false, error: reason.error.issues[0]?.message ?? "Lý do không hợp lệ." };
  await requireRole("teacher");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("teaching_check_in", { p_class: classId, p_note: reason.data || null });
    if (error) return { ok: false, error: rpcError("check_in", error), needNote: error.hint === "need_note" };
    revalidateTeaching();
    return { ok: true, data: { id: data } };
  } catch (err) {
    console.error("[teaching] check_in lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
}

/** "Kết thúc ca dạy" — giờ ghi theo máy chủ, đơn giá buổi được chốt. */
export async function endTeachingSession(sessionId: string): Promise<ActionResult<null>> {
  if (!isUuid(sessionId)) return { ok: false, error: INVALID_ID };
  await requireRole("teacher");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("teaching_check_out", { p_session: sessionId });
    if (error) return { ok: false, error: rpcError("check_out", error) };
  } catch (err) {
    console.error("[teaching] check_out lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateTeaching();
  return { ok: true, data: null };
}

// ============================================================================= Quản trị viên

/** "18:05" (giờ Việt Nam) trong ngày `date` → ISO. */
const vnTime = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`).toISOString();
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ không hợp lệ")
  .optional()
  .or(z.literal(""))
  .transform((v) => v || null);

const adjustSchema = z
  .object({
    id: z.string().uuid("Ca dạy không hợp lệ"),
    checkIn: timeSchema,
    checkOut: timeSchema,
    status: z.enum(["completed", "missed_checkout", "manual", "cancelled", "in_progress"]),
    note: z.string().trim().max(300, "Ghi chú tối đa 300 ký tự").optional().default(""),
  })
  .refine((v) => !v.checkIn || !v.checkOut || v.checkOut >= v.checkIn, { path: ["checkOut"], message: "Giờ kết thúc phải sau giờ bắt đầu" });

/** Sửa giờ / trạng thái 1 ca (quên bấm kết thúc, bấm nhầm, huỷ ca không hợp lệ). */
export async function adjustTeachingSession(input: z.input<typeof adjustSchema>): Promise<ActionResult<null>> {
  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  const profile = await requireRole("admin");
  const v = parsed.data;
  try {
    const supabase = await createClient();
    const { data: s, error: loadError } = await supabase.from("teaching_sessions").select("date, teacher_id, subject, rate").eq("id", v.id).maybeSingle();
    if (loadError) return { ok: false, error: rpcError("adjust.load", loadError) };
    if (!s) return { ok: false, error: "Không tìm thấy ca dạy." };
    // Ca được tính lương mà chưa chốt đơn giá → chốt theo đơn giá hiện hành
    let rate = s.rate;
    if (rate === null && v.status !== "cancelled" && v.status !== "in_progress") {
      const { data } = await supabase.rpc("teaching_rate_for", { p_teacher: s.teacher_id, p_subject: s.subject });
      rate = data ?? null;
    }
    const { error } = await supabase
      .from("teaching_sessions")
      .update({
        checked_in_at: v.checkIn ? vnTime(s.date, v.checkIn) : null,
        checked_out_at: v.checkOut ? vnTime(s.date, v.checkOut) : null,
        status: v.status,
        note: v.note || null,
        rate,
        adjusted_by: profile.id,
      })
      .eq("id", v.id);
    if (error) {
      if (error.code === "23505") return { ok: false, error: "Giáo viên đang có 1 ca khác chưa kết thúc." };
      return { ok: false, error: rpcError("adjust", error) };
    }
  } catch (err) {
    console.error("[teaching] adjust lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateTeaching();
  return { ok: true, data: null };
}

const manualSchema = z.object({
  teacherId: z.string().uuid("Vui lòng chọn giáo viên"),
  classId: z.string().uuid("Vui lòng chọn lớp"),
  date: z.string().refine(isISODate, "Ngày không hợp lệ"),
  checkIn: timeSchema,
  checkOut: timeSchema,
  note: z.string().trim().min(3, "Ghi lý do (vd: quên bấm bắt đầu ca, dạy bù)").max(300, "Ghi chú tối đa 300 ký tự"),
});

/** Thêm ca giáo viên quên bấm "Bắt đầu ca dạy" (hoặc dạy bù ghi nhận sau). */
export async function addManualSession(input: z.input<typeof manualSchema>): Promise<ActionResult<null>> {
  const parsed = manualSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  const profile = await requireRole("admin");
  const v = parsed.data;
  try {
    const supabase = await createClient();
    const { data: cls } = await supabase
      .from("classes")
      .select("id, campus, name, subject, shift:class_shifts(start_time, end_time)")
      .eq("id", v.classId)
      .maybeSingle();
    if (!cls) return { ok: false, error: "Lớp không tồn tại." };
    const subject = (cls.subject ?? "tong_hop") as PaySubject;
    const { data: rate } = await supabase.rpc("teaching_rate_for", { p_teacher: v.teacherId, p_subject: subject });
    const shift = cls.shift as { start_time: string; end_time: string } | null;
    const { error } = await supabase.from("teaching_sessions").insert({
      teacher_id: v.teacherId,
      class_id: cls.id,
      campus: cls.campus,
      class_name: cls.name,
      subject,
      date: v.date,
      scheduled_start: shift?.start_time ?? "18:00",
      scheduled_end: shift?.end_time ?? "19:30",
      checked_in_at: v.checkIn ? vnTime(v.date, v.checkIn) : null,
      checked_out_at: v.checkOut ? vnTime(v.date, v.checkOut) : null,
      status: "manual",
      note: v.note,
      rate: rate ?? null,
      adjusted_by: profile.id,
    });
    if (error) {
      if (error.code === "23505") return { ok: false, error: "Ca dạy lớp này trong ngày đã có — sửa ca đó thay vì thêm mới." };
      return { ok: false, error: rpcError("manual", error) };
    }
  } catch (err) {
    console.error("[teaching] manual lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateTeaching();
  return { ok: true, data: null };
}

const ratesSchema = z
  .array(
    z.object({
      subject: z.enum(PAY_SUBJECT_KEYS as [PaySubject, ...PaySubject[]]),
      teacherId: z.string().uuid().nullable(),
      rate: z.number().int("Đơn giá phải là số nguyên").min(0, "Đơn giá không hợp lệ").max(100_000_000, "Đơn giá quá lớn").nullable(),
    }),
  )
  .max(400);

/** Lưu bảng đơn giá: rate = null → xoá dòng (dùng đơn giá mặc định). Chỉ áp dụng cho ca kết thúc từ nay. */
export async function savePayRates(input: z.input<typeof ratesSchema>): Promise<ActionResult<null>> {
  const parsed = ratesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  await requireRole("admin");
  try {
    const supabase = await createClient();
    const { data: existing, error: loadError } = await supabase.from("teacher_pay_rates").select("id, subject, teacher_id");
    if (loadError) return { ok: false, error: rpcError("rates.load", loadError) };
    const idOf = (subject: string, teacher: string | null) => existing.find((r) => r.subject === subject && r.teacher_id === teacher)?.id;

    const toDelete = parsed.data
      .filter((r) => r.rate === null)
      .map((r) => idOf(r.subject, r.teacherId))
      .filter((id): id is string => !!id);
    const toUpsert = parsed.data.filter((r) => r.rate !== null);
    if (toDelete.length) {
      const { error } = await supabase.from("teacher_pay_rates").delete().in("id", toDelete);
      if (error) return { ok: false, error: rpcError("rates.delete", error) };
    }
    for (const r of toUpsert) {
      const id = idOf(r.subject, r.teacherId);
      const { error } = id
        ? await supabase.from("teacher_pay_rates").update({ rate: r.rate! }).eq("id", id)
        : await supabase.from("teacher_pay_rates").insert({ subject: r.subject, teacher_id: r.teacherId, rate: r.rate! });
      if (error) return { ok: false, error: rpcError("rates.save", error) };
    }
  } catch (err) {
    console.error("[teaching] savePayRates lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateTeaching();
  return { ok: true, data: null };
}

const classMetaSchema = z.object({
  classId: z.string().uuid("Lớp không hợp lệ"),
  subject: z.enum(["tien_tieu_hoc", "luyen_chu", "toan_tu_duy"]).nullable(),
  room: z
    .string()
    .trim()
    .max(40, "Tên phòng tối đa 40 ký tự")
    .transform((v) => v || null),
  /** Sĩ số tối đa (Phân tích vận hành — tỷ lệ lấp đầy). undefined = DB chưa có cột → không ghi */
  capacity: z.number().int("Sĩ số là số nguyên").min(1, "Sĩ số tối thiểu 1").max(200, "Sĩ số tối đa 200").nullable().optional(),
});

/** Môn dạy chính + phòng học + sĩ số tối đa của lớp (lịch dạy, đơn giá lương, tỷ lệ lấp đầy). */
export async function updateClassTeachingMeta(input: z.input<typeof classMetaSchema>): Promise<ActionResult<null>> {
  const parsed = classMetaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  await requireRole("admin");
  const v = parsed.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("classes")
      .update({ subject: v.subject, room: v.room, ...(v.capacity !== undefined && { capacity: v.capacity }) })
      .eq("id", v.classId);
    if (error) return { ok: false, error: rpcError("classMeta", error) };
  } catch (err) {
    console.error("[teaching] classMeta lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateTeaching();
  return { ok: true, data: null };
}
