import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getAttendanceOn(studentId: string, date: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance")
    .select("id, student_id, date, status, note, created_at")
    .eq("student_id", studentId)
    .eq("date", date)
    .maybeSingle();
  if (error) throw new Error("Không tải được điểm danh", { cause: error });
  return data;
}

/** Điểm danh của nhiều học sinh trong 1 ngày (màn điểm danh / tổng quan giáo viên). */
export async function listAttendanceOn(studentIds: string[], date: string) {
  if (studentIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance")
    .select("student_id, status, note")
    .in("student_id", studentIds)
    .eq("date", date);
  if (error) throw new Error("Không tải được điểm danh", { cause: error });
  return data;
}

/** Điểm danh trong khoảng [from, to] (bao gồm 2 đầu). */
export async function listAttendanceBetween(studentId: string, from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance")
    .select("id, student_id, date, status, note, created_at")
    .eq("student_id", studentId)
    .gte("date", from)
    .lte("date", to)
    .order("date");
  if (error) throw new Error("Không tải được lịch sử điểm danh", { cause: error });
  return data;
}
