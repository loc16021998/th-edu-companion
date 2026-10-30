import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

export type Shift = Tables<"class_shifts">;
export type ShiftRow = Shift & { classes: { id: string; name: string; campus: Tables<"classes">["campus"] }[] };

/** Bảng chưa tạo (chưa chạy migration) → `available: false` thay vì làm hỏng trang. */
function isMissing(code: string | undefined) {
  return code === "PGRST205" || code === "42P01" || code === "42703";
}

/** Danh sách ca học (mới nhất theo giờ bắt đầu) kèm các lớp đang dùng ca. */
export async function listShifts(): Promise<{ available: boolean; items: ShiftRow[] }> {
  const supabase = await createClient();
  const [shiftsRes, classesRes] = await Promise.all([
    supabase.from("class_shifts").select("id, name, start_time, end_time, weekdays, is_active, created_at").order("start_time").order("name"),
    supabase.from("classes").select("id, name, campus, shift_id"),
  ]);
  if (shiftsRes.error) {
    if (isMissing(shiftsRes.error.code)) return { available: false, items: [] };
    throw new Error("Không tải được ca học", { cause: shiftsRes.error });
  }
  const classes = classesRes.error ? [] : classesRes.data;
  return {
    available: true,
    items: shiftsRes.data.map((s) => ({
      ...s,
      classes: classes.filter((c) => c.shift_id === s.id).map(({ id, name, campus }) => ({ id, name, campus })),
    })),
  };
}

/** Ca học của một lớp (campus + tên lớp) — null nếu lớp chưa gán ca hoặc DB chưa có bảng ca học. */
export async function getClassShift(campus: Tables<"classes">["campus"], className: string): Promise<Shift | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("classes")
    .select("shift:class_shifts(id, name, start_time, end_time, weekdays, is_active, created_at)")
    .eq("campus", campus)
    .eq("name", className)
    .maybeSingle();
  if (error) {
    if (!isMissing(error.code)) console.error("[shifts] Không tải được ca của lớp:", error);
    return null;
  }
  return data?.shift ?? null;
}
