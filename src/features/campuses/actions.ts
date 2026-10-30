"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { rateLimit, tooManyMessage } from "@/lib/security/rate-limit";
import { requireRole } from "@/features/auth/queries";
import { INVALID_ID, isUuid } from "@/lib/validation";
import { schedulePushDelivery } from "@/features/push/deliver";
import type { ActionResult } from "@/types/action-result";
import { campusProfileSchema, decideTransferSchema, transferRequestSchema, type CampusProfileInput } from "./schema";

const CONNECTION_ERROR = "Không thể kết nối máy chủ. Vui lòng thử lại.";
const MIGRATION_MESSAGE = "Database chưa có bảng cơ sở — hãy chạy file supabase/apply-campuses.sql trong Supabase SQL Editor.";
const isMissing = (code: string) => ["PGRST205", "PGRST202", "42P01", "42703"].includes(code);

function fail(scope: string, error: { code: string; message: string }) {
  console.error(`[campuses] ${scope}:`, error);
  return isMissing(error.code) ? MIGRATION_MESSAGE : dbErrorMessage(error);
}

// ============================================================================= Phụ huynh

/** Xin chuyển bé sang cơ sở khác. Khoảng cách (nếu phụ huynh cho định vị) được làm tròn 0,1 km — không lưu toạ độ nhà. */
export async function submitTransferRequest(input: unknown): Promise<ActionResult<null>> {
  const parsed = transferRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  const profile = await requireRole("parent");
  const limit = await rateLimit("submitForm", `campus-transfer:${profile.id}`);
  if (!limit.ok) return { ok: false, error: tooManyMessage(limit.retryAfter) };
  const v = parsed.data;
  const round = (n: number | null | undefined) => (typeof n === "number" ? Math.round(n * 10) / 10 : null);

  try {
    const supabase = await createClient();
    const { data: student } = await supabase.from("students").select("id, campus").eq("id", v.studentId).maybeSingle();
    if (!student) return { ok: false, error: "Không tìm thấy bé." };
    if (student.campus === v.toCampus) return { ok: false, error: "Bé đang học ở cơ sở này rồi." };
    const { error } = await supabase.from("campus_transfer_requests").insert({
      student_id: v.studentId,
      from_campus: student.campus,
      to_campus: v.toCampus,
      reason: v.reason || null,
      distance_from_km: round(v.distanceFromKm),
      distance_to_km: round(v.distanceToKm),
    });
    if (error) {
      if (error.code === "23505") return { ok: false, error: "Bé đã có 1 đơn đang chờ trung tâm xử lý." };
      return { ok: false, error: fail("submit", error) };
    }
  } catch (err) {
    console.error("[campuses] submitTransferRequest lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidatePath("/parent/campuses");
  revalidatePath("/admin/campuses");
  return { ok: true, data: null };
}

export async function cancelTransferRequest(id: string): Promise<ActionResult<null>> {
  if (!isUuid(id)) return { ok: false, error: INVALID_ID };
  await requireRole("parent");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("campus_transfer_requests").update({ status: "cancelled" }).eq("id", id).eq("status", "pending").select("id");
    if (error) return { ok: false, error: fail("cancel", error) };
    if (!data.length) return { ok: false, error: "Đơn đã được xử lý, không rút được nữa." };
  } catch (err) {
    console.error("[campuses] cancelTransferRequest lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidatePath("/parent/campuses");
  revalidatePath("/admin/campuses");
  return { ok: true, data: null };
}

// ============================================================================= Quản trị viên

export async function updateCampusProfile(input: CampusProfileInput): Promise<ActionResult<null>> {
  const parsed = campusProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  const profile = await requireRole("admin");
  const v = parsed.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("campus_profiles")
      .update({
        name: v.name,
        address: v.address,
        lat: v.lat,
        lng: v.lng,
        location_verified: v.locationVerified,
        google_maps_url: v.googleMapsUrl,
        contacts: v.contacts,
        opening_hours: v.openingHours,
        updated_by: profile.id,
      })
      .eq("campus", v.campus);
    if (error) return { ok: false, error: fail("updateProfile", error) };
  } catch (err) {
    console.error("[campuses] updateCampusProfile lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidatePath("/admin/campuses");
  revalidatePath("/parent", "layout");
  return { ok: true, data: null };
}

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Ảnh mặt tiền (đã nén ở trình duyệt < 400KB) → bucket công khai campus-photos. */
export async function uploadCampusPhoto(formData: FormData): Promise<ActionResult<{ url: string }>> {
  const campus = formData.get("campus");
  const file = formData.get("photo");
  if (campus !== "CS1_XALA" && campus !== "CS2_NGOTHINHAM") return { ok: false, error: "Cơ sở không hợp lệ." };
  if (!(file instanceof File) || !PHOTO_TYPES.includes(file.type)) return { ok: false, error: "Chọn ảnh JPG, PNG hoặc WEBP." };
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: "Ảnh tối đa 2MB." };
  const profile = await requireRole("admin");
  try {
    const supabase = await createClient();
    const path = `${campus}/${Date.now()}.${file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"}`;
    const { error: upError } = await supabase.storage.from("campus-photos").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    if (upError) {
      console.error("[campuses] upload ảnh lỗi:", upError);
      return { ok: false, error: /bucket/i.test(upError.message) ? MIGRATION_MESSAGE : "Không tải được ảnh lên." };
    }
    const url = supabase.storage.from("campus-photos").getPublicUrl(path).data.publicUrl;
    const { error } = await supabase.from("campus_profiles").update({ photo_url: url, updated_by: profile.id }).eq("campus", campus);
    if (error) return { ok: false, error: fail("photo", error) };
    revalidatePath("/admin/campuses");
    revalidatePath("/parent", "layout");
    return { ok: true, data: { url } };
  } catch (err) {
    console.error("[campuses] uploadCampusPhoto lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
}

/** Duyệt (xếp vào lớp mới ở cơ sở mới) hoặc từ chối đơn chuyển cơ sở → phụ huynh nhận thông báo. */
export async function decideTransferRequest(input: unknown): Promise<ActionResult<null>> {
  const parsed = decideTransferSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  const profile = await requireRole("admin");
  const v = parsed.data;
  try {
    const supabase = await createClient();
    const { data: req, error: loadError } = await supabase.from("campus_transfer_requests").select("id, student_id, to_campus, status").eq("id", v.id).maybeSingle();
    if (loadError) return { ok: false, error: fail("decide.load", loadError) };
    if (!req) return { ok: false, error: "Không tìm thấy đơn." };
    if (req.status !== "pending") return { ok: false, error: "Đơn đã được xử lý." };

    let className: string | null = null;
    if (v.decision === "approved") {
      const { data: cls } = await supabase.from("classes").select("campus, name").eq("id", v.classId!).maybeSingle();
      if (!cls || cls.campus !== req.to_campus) return { ok: false, error: "Lớp mới phải thuộc cơ sở bé xin chuyển tới." };
      // Chuyển bé sang lớp mới (khoá ngoại campus + lớp)
      const { error: moveError } = await supabase.from("students").update({ campus: cls.campus, class_name: cls.name }).eq("id", req.student_id);
      if (moveError) return { ok: false, error: fail("decide.move", moveError) };
      className = cls.name;
    }
    const { error } = await supabase
      .from("campus_transfer_requests")
      .update({ status: v.decision, admin_note: v.note || null, new_class_name: className, decided_by: profile.id, decided_at: new Date().toISOString() })
      .eq("id", v.id)
      .eq("status", "pending");
    if (error) return { ok: false, error: fail("decide", error) };
  } catch (err) {
    console.error("[campuses] decideTransferRequest lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  if (v.decision === "approved") revalidateTag(CACHE_TAGS.students);
  schedulePushDelivery();
  revalidatePath("/admin", "layout");
  revalidatePath("/parent", "layout");
  revalidatePath("/teacher", "layout");
  return { ok: true, data: null };
}
