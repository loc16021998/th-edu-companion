import "server-only";
import { cache } from "react";
import { CAMPUS_LABELS } from "@/config/constants";
import { createClient } from "@/lib/supabase/server";
import { givenName } from "@/lib/utils";
import type { Enums, Tables } from "@/types/database.types";
import { STUDENT_COLUMNS } from "@/features/students/queries";
import { getLoginEmails } from "./accounts";

// Mọi truy vấn ở đây chạy bằng session admin — RLS "admin_all_*" cho phép đọc toàn bộ.

/** Bảng do các migration mới tạo — khu Quản trị cần đủ trước khi hiển thị. */
const REQUIRED_TABLES = ["classes", "teacher_attendance", "notifications"] as const;
export type RequiredTable = (typeof REQUIRED_TABLES)[number];

/**
 * Kiểm tra database đã chạy đủ migration chưa. PGRST205 = PostgREST không thấy bảng (chưa tạo).
 * Trả về danh sách bảng còn thiếu; lỗi khác (mạng, quyền) vẫn throw để error.tsx xử lý.
 */
export const getMissingTables = cache(async (): Promise<RequiredTable[]> => {
  const supabase = await createClient();
  const results = await Promise.all(
    REQUIRED_TABLES.map(async (table) => {
      const { error } = await supabase.from(table).select("id", { head: true }).limit(1);
      if (!error) return null;
      if (error.code === "PGRST205" || error.code === "42P01") return table;
      throw new Error(`Không kiểm tra được bảng ${table}`, { cause: error });
    }),
  );
  return results.filter((t): t is RequiredTable => t !== null);
});

const CAMPUS_ORDER = Object.keys(CAMPUS_LABELS) as Enums<"campus">[];
const collator = new Intl.Collator("vi", { numeric: true, sensitivity: "base" });

export type PersonOption = { id: string; full_name: string; phone: string | null; campus: Enums<"campus"> | null };

export async function listProfilesByRole(role: Enums<"roles">): Promise<PersonOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone, campus")
    .eq("role", role)
    .order("full_name");
  if (error) throw new Error("Không tải được danh sách tài khoản", { cause: error });
  return data.sort((a, b) => collator.compare(givenName(a.full_name), givenName(b.full_name)));
}

export type ClassRow = Tables<"classes"> & {
  label: string;
  studentCount: number;
  /** Giáo viên phụ trách riêng lớp này */
  teachers: { id: string; full_name: string }[];
  /** Giáo viên phụ trách toàn cơ sở (cũng xem được lớp) */
  campusTeachers: { id: string; full_name: string }[];
};

export async function listClasses(): Promise<ClassRow[]> {
  const supabase = await createClient();
  const [classesRes, studentsRes, assignmentsRes] = await Promise.all([
    supabase.from("classes").select("id, campus, name, shift_id, monthly_fee, created_at"),
    supabase.from("students").select("campus, class_name"),
    supabase.from("teacher_assignments").select("campus, class_name, teacher:profiles!teacher_assignments_teacher_id_fkey(id, full_name)"),
  ]);
  if (classesRes.error) throw new Error("Không tải được danh sách lớp", { cause: classesRes.error });
  if (studentsRes.error) throw new Error("Không tải được học sinh", { cause: studentsRes.error });
  if (assignmentsRes.error) throw new Error("Không tải được phân công", { cause: assignmentsRes.error });

  const counts = new Map<string, number>();
  for (const s of studentsRes.data) {
    const key = `${s.campus}:${s.class_name}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return classesRes.data
    .map((c) => {
      const teachers: ClassRow["teachers"] = [];
      const campusTeachers: ClassRow["campusTeachers"] = [];
      for (const a of assignmentsRes.data) {
        if (a.campus !== c.campus || !a.teacher) continue;
        if (a.class_name === c.name) teachers.push(a.teacher);
        else if (a.class_name === null) campusTeachers.push(a.teacher);
      }
      return {
        ...c,
        label: `Lớp ${c.name} · ${CAMPUS_LABELS[c.campus]}`,
        studentCount: counts.get(`${c.campus}:${c.name}`) ?? 0,
        teachers,
        campusTeachers,
      };
    })
    .sort((a, b) => CAMPUS_ORDER.indexOf(a.campus) - CAMPUS_ORDER.indexOf(b.campus) || collator.compare(a.name, b.name));
}

export type StudentRow = Tables<"students"> & { parent: { id: string; full_name: string; phone: string | null } | null };

export async function listStudentsWithParents(): Promise<StudentRow[]> {
  const supabase = await createClient();
  const run = (columns: string) =>
    supabase.from("students").select(`${columns}, parent:profiles!students_parent_id_fkey(id, full_name, phone)`).order("full_name");
  let res = await run(STUDENT_COLUMNS);
  // DB chưa có cột môn đăng ký → đọc lại không có cột đó
  if (res.error && (res.error.code === "42703" || res.error.code === "PGRST204")) res = await run(STUDENT_COLUMNS.replace(", subjects", ""));
  if (res.error) throw new Error("Không tải được danh sách học sinh", { cause: res.error });
  return (res.data as unknown as StudentRow[]).sort(
    (a, b) =>
      CAMPUS_ORDER.indexOf(a.campus) - CAMPUS_ORDER.indexOf(b.campus) ||
      collator.compare(a.class_name, b.class_name) ||
      collator.compare(givenName(a.full_name), givenName(b.full_name)),
  );
}

export async function listAllFees() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fees")
    .select("id, student_id, title, amount, paid_amount, status, due_date, created_at, student:students(id, full_name, class_name, campus)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error("Không tải được học phí", { cause: error });
  return data;
}

export type FeeRow = Awaited<ReturnType<typeof listAllFees>>[number];

export async function listTeacherAttendanceOn(date: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teacher_attendance")
    .select("teacher_id, status, note")
    .eq("date", date);
  if (error) throw new Error("Không tải được chấm công", { cause: error });
  return data;
}

export type AccountRow = {
  id: string;
  role: "parent" | "teacher";
  full_name: string;
  phone: string | null;
  email: string | null;
  campus: Enums<"campus"> | null;
  created_at: string;
  /** Phụ huynh: tên các con · Giáo viên: các lớp phụ trách */
  links: string[];
};

/** Tài khoản phụ huynh + giáo viên (không gồm quản trị), kèm con / lớp phụ trách. */
export async function listAccounts(): Promise<AccountRow[]> {
  const supabase = await createClient();
  const [profilesRes, studentsRes, assignmentsRes, emails] = await Promise.all([
    supabase.from("profiles").select("id, role, full_name, phone, campus, created_at").in("role", ["parent", "teacher"]),
    supabase.from("students").select("full_name, parent_id").not("parent_id", "is", null),
    supabase.from("teacher_assignments").select("teacher_id, campus, class_name"),
    getLoginEmails(),
  ]);
  if (profilesRes.error) throw new Error("Không tải được danh sách tài khoản", { cause: profilesRes.error });
  if (studentsRes.error) throw new Error("Không tải được học sinh", { cause: studentsRes.error });
  if (assignmentsRes.error) throw new Error("Không tải được phân công", { cause: assignmentsRes.error });

  const links = new Map<string, string[]>();
  const add = (id: string, label: string) => links.set(id, [...(links.get(id) ?? []), label]);
  for (const s of studentsRes.data) if (s.parent_id) add(s.parent_id, givenName(s.full_name));
  for (const a of assignmentsRes.data) add(a.teacher_id, a.class_name ? `Lớp ${a.class_name}` : `Cả ${CAMPUS_LABELS[a.campus]}`);

  return profilesRes.data
    .flatMap((p) =>
      p.role === "parent" || p.role === "teacher"
        ? [{ ...p, role: p.role, email: emails.get(p.id) ?? null, links: links.get(p.id) ?? [] }]
        : [],
    )
    .sort((a, b) => collator.compare(givenName(a.full_name), givenName(b.full_name)));
}
