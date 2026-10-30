import { SUBJECTS, type SubjectKey } from "@/config/constants";

export const SUBJECT_KEYS = Object.keys(SUBJECTS) as SubjectKey[];

export function isSubjectKey(value: unknown): value is SubjectKey {
  return typeof value === "string" && value in SUBJECTS;
}

/**
 * Môn học sinh đã đăng ký (cột students.subjects), theo thứ tự cố định của SUBJECTS.
 * Chưa có dữ liệu (DB chưa chạy migration / mảng rỗng) → coi như đăng ký đủ các môn.
 */
export function enrolledSubjects(student: { subjects?: string[] | null }): SubjectKey[] {
  const picked = new Set((student.subjects ?? []).filter(isSubjectKey));
  return picked.size ? SUBJECT_KEYS.filter((k) => picked.has(k)) : SUBJECT_KEYS;
}
