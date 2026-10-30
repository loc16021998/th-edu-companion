"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { rateLimit, tooManyMessage } from "@/lib/security/rate-limit";
import { requireRole } from "@/features/auth/queries";
import { schedulePushDelivery } from "@/features/push/deliver";
import type { ActionResult } from "@/types/action-result";
import { CONSULT_MIGRATION_MESSAGE, WEEKDAYS } from "./constants";
import { adminScheduleSchema, availabilitySchema, bookSchema, cancelSchema, decideSchema } from "./schema";
import { overlapsExisting } from "./time";

const CONNECTION_ERROR = "Không thể kết nối máy chủ. Vui lòng thử lại.";
const isMissing = (code: string) => ["PGRST205", "PGRST202", "42P01", "42703", "42883"].includes(code);

function fail(scope: string, error: { code: string; message: string }) {
  // Lỗi nghiệp vụ do RPC / trigger báo (P0001) → hiện nguyên câu tiếng Việt cho người dùng
  if (error.code === "P0001") return error.message;
  console.error(`[consultations] ${scope}:`, error);
  if (isMissing(error.code)) return CONSULT_MIGRATION_MESSAGE;
  return dbErrorMessage(error);
}

const firstIssue = (error: { issues: { message: string }[] }) => error.issues[0]?.message ?? "Dữ liệu không hợp lệ.";

function revalidateBookings() {
  revalidatePath("/teacher/availability");
  revalidatePath("/parent/booking");
  revalidatePath("/admin/consultations");
}

// ============================================================================= Khung giờ rảnh (giáo viên / quản trị viên — của chính mình)

export async function saveAvailability(input: unknown): Promise<ActionResult<null>> {
  const parsed = availabilitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const profile = await requireRole("teacher", "admin");
  const v = parsed.data;
  try {
    const supabase = await createClient();
    const { data: existing, error: loadError } = await supabase
      .from("consultation_availability")
      .select("id, weekday, start_time, end_time")
      .eq("host_id", profile.id)
      .eq("weekday", v.weekday);
    if (loadError) return { ok: false, error: fail("availability.load", loadError) };
    const clash = overlapsExisting(
      { id: v.id, weekday: v.weekday, start: v.start, end: v.end },
      existing.map((w) => ({ id: w.id, weekday: w.weekday, start: w.start_time.slice(0, 5), end: w.end_time.slice(0, 5) })),
    );
    if (clash) {
      const day = WEEKDAYS.find((d) => d.value === v.weekday)?.label ?? "";
      return { ok: false, error: `Trùng với khung ${day} ${clash.start}–${clash.end} đã có. Hãy sửa khung đó hoặc chọn giờ khác.` };
    }
    const row = {
      weekday: v.weekday,
      start_time: v.start,
      end_time: v.end,
      slot_minutes: v.slotMinutes,
      mode: v.mode,
      meeting_url: v.mode === "online" ? v.meetingUrl : null,
      location: v.mode === "in_person" ? v.location : null,
      audience: profile.role === "admin" ? v.audience : "parents",
      active: v.active,
    };
    const { error } = v.id
      ? await supabase.from("consultation_availability").update(row).eq("id", v.id).eq("host_id", profile.id)
      : await supabase.from("consultation_availability").insert({ ...row, host_id: profile.id });
    if (error) return { ok: false, error: fail("availability.save", error) };
  } catch (err) {
    console.error("[consultations] saveAvailability lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateBookings();
  return { ok: true, data: null };
}

/** Xoá khung giờ (quản trị viên xoá được khung của giáo viên) — lịch hẹn đã đặt vẫn giữ nguyên. */
export async function deleteAvailability(id: unknown): Promise<ActionResult<null>> {
  const parsed = cancelSchema.pick({ id: true }).safeParse({ id });
  if (!parsed.success) return { ok: false, error: "Dữ liệu không hợp lệ." };
  const profile = await requireRole("teacher", "admin");
  try {
    const supabase = await createClient();
    let query = supabase.from("consultation_availability").delete().eq("id", parsed.data.id);
    if (profile.role !== "admin") query = query.eq("host_id", profile.id);
    const { error } = await query;
    if (error) return { ok: false, error: fail("availability.delete", error) };
  } catch (err) {
    console.error("[consultations] deleteAvailability lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateBookings();
  return { ok: true, data: null };
}

/** Quản trị viên tạm dừng / mở lại khung giờ của bất kỳ ai. */
export async function setAvailabilityActive(input: { id: unknown; active: unknown }): Promise<ActionResult<null>> {
  const parsed = cancelSchema.pick({ id: true }).safeParse({ id: input.id });
  if (!parsed.success || typeof input.active !== "boolean") return { ok: false, error: "Dữ liệu không hợp lệ." };
  await requireRole("admin");
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("consultation_availability").update({ active: input.active }).eq("id", parsed.data.id);
    if (error) return { ok: false, error: fail("availability.active", error) };
  } catch (err) {
    console.error("[consultations] setAvailabilityActive lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateBookings();
  return { ok: true, data: null };
}

// ============================================================================= Đặt / lên lịch / xác nhận / huỷ

/** Phụ huynh (kèm bé) hoặc giáo viên đặt 1 ô trống của người chủ trì. */
export async function bookConsultation(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const profile = await requireRole("parent", "teacher");
  const limit = await rateLimit("submitForm", `consultation:${profile.id}`);
  if (!limit.ok) return { ok: false, error: tooManyMessage(limit.retryAfter) };
  const v = parsed.data;
  let id: string;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("book_consultation", { p_host_id: v.hostId, p_starts_at: v.startsAt, p_topic: v.topic, p_student_id: v.studentId ?? null });
    if (error) return { ok: false, error: fail("book", error) };
    id = data;
  } catch (err) {
    console.error("[consultations] bookConsultation lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  schedulePushDelivery();
  revalidateBookings();
  return { ok: true, data: { id } };
}

/** Quản trị viên lên lịch trực tiếp (xác nhận ngay) — với phụ huynh / giáo viên, hoặc sắp xếp giáo viên ↔ phụ huynh. */
export async function adminScheduleConsultation(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = adminScheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  await requireRole("admin");
  const v = parsed.data;
  let id: string;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_schedule_consultation", {
      p_host_id: v.hostId,
      p_guest_id: v.guestId,
      p_student_id: v.studentId ?? null,
      // Giờ Việt Nam (+07:00, không đổi giờ mùa hè)
      p_starts_at: new Date(`${v.date}T${v.time}:00+07:00`).toISOString(),
      p_minutes: v.minutes,
      p_mode: v.mode,
      p_topic: v.topic,
      p_meeting_url: v.meetingUrl,
      p_location: v.location || null,
    });
    if (error) return { ok: false, error: fail("adminSchedule", error) };
    id = data;
  } catch (err) {
    console.error("[consultations] adminScheduleConsultation lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  schedulePushDelivery();
  revalidateBookings();
  return { ok: true, data: { id } };
}

export async function decideBooking(input: unknown): Promise<ActionResult<null>> {
  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  await requireRole("teacher", "admin");
  const v = parsed.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("decide_consultation", { p_id: v.id, p_confirm: v.confirm, p_note: v.note || null, p_meeting_url: v.meetingUrl });
    if (error) return { ok: false, error: fail("decide", error) };
  } catch (err) {
    console.error("[consultations] decideBooking lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  schedulePushDelivery();
  revalidateBookings();
  return { ok: true, data: null };
}

export async function cancelBooking(input: unknown): Promise<ActionResult<null>> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  await requireRole("parent", "teacher", "admin");
  const v = parsed.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("cancel_consultation", { p_id: v.id, p_reason: v.reason || null });
    if (error) return { ok: false, error: fail("cancel", error) };
  } catch (err) {
    console.error("[consultations] cancelBooking lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  schedulePushDelivery();
  revalidateBookings();
  return { ok: true, data: null };
}
