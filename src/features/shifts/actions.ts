"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { formError, formSuccess, zodFormError, type FormState } from "@/lib/form-state";
import { requireRole } from "@/features/auth/queries";
import type { ActionResult } from "@/types/action-result";
import { assignShiftSchema, shiftSchema } from "./schema";
import { INVALID_ID, isUuid } from "@/lib/validation";

// Mọi thao tác ghi ca học: requireRole("admin") ở đây + RLS chỉ cho admin ghi bảng class_shifts.

const CONNECTION_ERROR = "Không thể kết nối máy chủ. Vui lòng thử lại.";

function revalidateShiftPages() {
  revalidatePath("/admin", "layout");
  revalidatePath("/parent", "layout");
  revalidatePath("/teacher", "layout");
}

function parseShiftForm(formData: FormData) {
  return shiftSchema.safeParse({
    name: formData.get("name") ?? "",
    startTime: formData.get("startTime") ?? "",
    endTime: formData.get("endTime") ?? "",
    weekdays: formData.getAll("weekdays"),
  });
}

export async function createShift(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseShiftForm(formData);
  if (!parsed.success) return zodFormError(parsed.error);
  await requireRole("admin");
  const v = parsed.data;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("class_shifts")
      .insert({ name: v.name, start_time: v.startTime, end_time: v.endTime, weekdays: v.weekdays });
    if (error) {
      if (error.code === "23505") return formError("Đã có ca học trùng tên.", { name: "Tên ca bị trùng" });
      if (error.code === "PGRST205") return formError("Database chưa có bảng ca học — hãy chạy file supabase/apply-class-shifts.sql.");
      console.error("[shifts] createShift lỗi:", error);
      return formError(dbErrorMessage(error));
    }
  } catch (err) {
    console.error("[shifts] createShift lỗi:", err);
    return formError(CONNECTION_ERROR);
  }

  revalidateShiftPages();
  return formSuccess(`Đã tạo ca "${v.name}".`);
}

export async function setShiftActive(id: string, active: boolean): Promise<ActionResult<null>> {
  if (!isUuid(id) || typeof active !== "boolean") return { ok: false, error: INVALID_ID };
  await requireRole("admin");
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("class_shifts").update({ is_active: active }).eq("id", id);
    if (error) return { ok: false, error: dbErrorMessage(error) };
  } catch (err) {
    console.error("[shifts] setShiftActive lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateShiftPages();
  return { ok: true, data: null };
}

/** Xoá ca: các lớp đang dùng ca tự quay về lịch mặc định (FK on delete set null). */
export async function deleteShift(id: string): Promise<ActionResult<null>> {
  if (!isUuid(id)) return { ok: false, error: INVALID_ID };
  await requireRole("admin");
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("class_shifts").delete().eq("id", id);
    if (error) return { ok: false, error: dbErrorMessage(error) };
  } catch (err) {
    console.error("[shifts] deleteShift lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateShiftPages();
  return { ok: true, data: null };
}

/** Gán / bỏ ca cho lớp (shiftId null = dùng lịch mặc định). */
export async function assignClassShift(classId: string, shiftId: string | null): Promise<ActionResult<null>> {
  const parsed = assignShiftSchema.safeParse({ classId, shiftId });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  await requireRole("admin");
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("classes").update({ shift_id: parsed.data.shiftId }).eq("id", parsed.data.classId);
    if (error) return { ok: false, error: dbErrorMessage(error) };
  } catch (err) {
    console.error("[shifts] assignClassShift lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateShiftPages();
  return { ok: true, data: null };
}
