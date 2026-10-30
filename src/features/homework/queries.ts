import "server-only";
import { createClient } from "@/lib/supabase/server";
import { addDays, startOfWeek } from "@/lib/date";
import { resolveMediaUrls, type MediaItem } from "@/features/daily-reports/media";
import type { Enums, Tables } from "@/types/database.types";
import { HOMEWORK_BUCKET, type HomeworkStatus, type SubmissionType } from "./constants";

type Assignment = Tables<"homework_assignments">;
type Submission = Tables<"homework_submissions">;

function isMissing(code: string | undefined) {
  return code === "PGRST205" || code === "42P01" || code === "PGRST202";
}

export type GradedView = {
  hearted: boolean;
  stars: number | null;
  comment: string | null;
  voiceUrl: string | null;
  gradedAt: string | null;
};

export type ParentHomeworkItem = {
  assignment: Pick<Assignment, "id" | "title" | "instructions" | "subject" | "due_date" | "created_at"> & { submission_type: SubmissionType };
  status: HomeworkStatus;
  submission: (Pick<Submission, "id" | "parent_note" | "submitted_at"> & { media: MediaItem[] } & GradedView) | null;
};

/** URL nghe lời nhắn thoại (signed, ngắn hạn). */
async function voiceUrls(paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (paths.length === 0) return map;
  const supabase = await createClient();
  const { data } = await supabase.storage.from(HOMEWORK_BUCKET).createSignedUrls(paths, 60 * 60);
  for (const item of data ?? []) if (item.path && item.signedUrl && !item.error) map.set(item.path, item.signedUrl);
  return map;
}

/** Bài tập của lớp bé + bài nộp của bé (RLS: phụ huynh của bé). */
export async function listParentHomework(student: Pick<Tables<"students">, "id" | "campus" | "class_name">): Promise<{ available: boolean; items: ParentHomeworkItem[] }> {
  const supabase = await createClient();
  const [assignmentsRes, submissionsRes] = await Promise.all([
    supabase
      .from("homework_assignments")
      .select("id, title, instructions, subject, due_date, created_at, submission_type")
      .eq("campus", student.campus)
      .eq("class_name", student.class_name)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("homework_submissions")
      .select("id, assignment_id, student_id, media_paths, parent_note, status, submitted_at, hearted, stars, teacher_comment, voice_path, graded_at")
      .eq("student_id", student.id),
  ]);
  if (assignmentsRes.error) {
    if (isMissing(assignmentsRes.error.code)) return { available: false, items: [] };
    throw new Error("Không tải được bài tập", { cause: assignmentsRes.error });
  }
  if (submissionsRes.error) throw new Error("Không tải được bài nộp", { cause: submissionsRes.error });

  const byAssignment = new Map(submissionsRes.data.map((s) => [s.assignment_id, s]));
  const voices = await voiceUrls(submissionsRes.data.flatMap((s) => (s.voice_path ? [s.voice_path] : [])));

  const items = await Promise.all(
    assignmentsRes.data.map(async (a): Promise<ParentHomeworkItem> => {
      const sub = byAssignment.get(a.id);
      return {
        assignment: { ...a, submission_type: a.submission_type as SubmissionType },
        status: !sub ? "pending" : sub.status === "graded" ? "graded" : "submitted",
        submission: sub
          ? {
              id: sub.id,
              parent_note: sub.parent_note,
              submitted_at: sub.submitted_at,
              media: await resolveMediaUrls(sub.media_paths, 60 * 60, HOMEWORK_BUCKET),
              hearted: sub.hearted,
              stars: sub.stars,
              comment: sub.teacher_comment,
              voiceUrl: sub.voice_path ? (voices.get(sub.voice_path) ?? null) : null,
              gradedAt: sub.graded_at,
            }
          : null,
      };
    }),
  );
  return { available: true, items };
}

export type ClassAssignmentRow = Pick<Assignment, "id" | "title" | "subject" | "due_date" | "created_at"> & {
  submission_type: SubmissionType;
  submitted: number;
  graded: number;
};

/** Bài tập đã giao cho 1 lớp + số bài nộp / đã chấm (giáo viên / quản trị). */
export async function listClassAssignments(campus: Enums<"campus">, className: string): Promise<{ available: boolean; items: ClassAssignmentRow[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("homework_assignments")
    .select("id, title, subject, due_date, created_at, submission_type, homework_submissions(status)")
    .eq("campus", campus)
    .eq("class_name", className)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) {
    if (isMissing(error.code)) return { available: false, items: [] };
    throw new Error("Không tải được bài tập", { cause: error });
  }
  return {
    available: true,
    items: data.map(({ homework_submissions: subs, ...a }) => ({
      ...a,
      submission_type: a.submission_type as SubmissionType,
      submitted: subs.length,
      graded: subs.filter((s) => s.status === "graded").length,
    })),
  };
}

export type GradingItem = {
  id: string;
  status: "submitted" | "graded";
  student: { id: string; full_name: string; avatar_url: string | null };
  assignment: { id: string; title: string };
  media: MediaItem[];
  parentNote: string | null;
  submittedAt: string;
} & GradedView & { voicePath: string | null };

/** Bài nộp của 1 lớp để chấm (giáo viên phụ trách / quản trị). `status`: "submitted" (chờ chấm) | "graded". */
export async function listSubmissionsForGrading(
  campus: Enums<"campus">,
  className: string,
  status: "submitted" | "graded",
): Promise<{ available: boolean; items: GradingItem[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("homework_submissions")
    .select(
      "id, status, media_paths, parent_note, submitted_at, hearted, stars, teacher_comment, voice_path, graded_at, student:students!inner(id, full_name, avatar_url), assignment:homework_assignments!inner(id, title, campus, class_name)",
    )
    .eq("assignment.campus", campus)
    .eq("assignment.class_name", className)
    .eq("status", status)
    .order(status === "submitted" ? "submitted_at" : "graded_at", { ascending: status === "submitted" })
    .limit(status === "submitted" ? 50 : 30);
  if (error) {
    if (isMissing(error.code)) return { available: false, items: [] };
    throw new Error("Không tải được bài nộp", { cause: error });
  }
  const voices = await voiceUrls(data.flatMap((s) => (s.voice_path ? [s.voice_path] : [])));

  const items = await Promise.all(
    data.map(
      async (s): Promise<GradingItem> => ({
        id: s.id,
        status: s.status === "graded" ? "graded" : "submitted",
        student: { id: s.student.id, full_name: s.student.full_name, avatar_url: s.student.avatar_url },
        assignment: { id: s.assignment.id, title: s.assignment.title },
        media: await resolveMediaUrls(s.media_paths, 60 * 60, HOMEWORK_BUCKET),
        parentNote: s.parent_note,
        submittedAt: s.submitted_at,
        hearted: s.hearted,
        stars: s.stars,
        comment: s.teacher_comment,
        voicePath: s.voice_path,
        voiceUrl: s.voice_path ? (voices.get(s.voice_path) ?? null) : null,
        gradedAt: s.graded_at,
      }),
    ),
  );
  return { available: true, items };
}

export type LeaderboardRow = { studentId: string | null; name: string; stars: number; graded: number; isMine: boolean };

/** "Ngôi sao chăm chỉ" của lớp trong tuần chứa `day` (Thứ 2 → Chủ nhật). */
export async function getStarLeaderboard(campus: Enums<"campus">, className: string, day: string) {
  const from = startOfWeek(day);
  const to = addDays(from, 6);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("homework_star_leaderboard", { p_campus: campus, p_class: className, p_from: from, p_to: to });
  if (error) {
    if (!isMissing(error.code)) console.error("[homework] Không tải được bảng xếp hạng:", error);
    return { from, to, rows: [] as LeaderboardRow[] };
  }
  return {
    from,
    to,
    rows: (data ?? []).map((r) => ({ studentId: r.student_id, name: r.display_name, stars: Number(r.stars), graded: Number(r.graded_count), isMine: r.is_mine })),
  };
}

export type ClassStudentHomework = { submitted: number; graded: number; stars: number };

/** Tình hình nộp bài của từng học sinh trong lớp (quản trị / giáo viên): studentId → số bài đã nộp, đã chấm, tổng sao. */
export async function getClassHomeworkStatus(campus: Enums<"campus">, className: string): Promise<Map<string, ClassStudentHomework>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("homework_submissions")
    .select("student_id, status, stars, assignment:homework_assignments!inner(campus, class_name)")
    .eq("assignment.campus", campus)
    .eq("assignment.class_name", className);
  const map = new Map<string, ClassStudentHomework>();
  if (error) {
    if (!isMissing(error.code)) console.error("[homework] Không tải được tình hình nộp bài:", error);
    return map;
  }
  for (const s of data) {
    const row = map.get(s.student_id) ?? { submitted: 0, graded: 0, stars: 0 };
    row.submitted += 1;
    if (s.status === "graded") {
      row.graded += 1;
      row.stars += s.stars ?? 0;
    }
    map.set(s.student_id, row);
  }
  return map;
}
