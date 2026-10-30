import "server-only";
import { createClient } from "@/lib/supabase/server";
import { addMonths, todayVN } from "@/lib/date";
import { enrolledSubjects } from "@/lib/subjects";
import { givenName } from "@/lib/utils";
import type { StudentRecord } from "@/features/students/queries";
import { SURVEY_SUBJECTS, surveyPeriod, surveyWindowOpen, type SurveySubject } from "./constants";

function isMissing(code: string | undefined) {
  return code === "PGRST205" || code === "42P01";
}

export type SurveyPrompt = { period: string; subjects: SurveySubject[]; childNames: string[] };

/**
 * Phụ huynh có cần hiện popup khảo sát không: đang trong đợt cuối tháng và chưa trả lời / từ chối tháng này.
 * Ngoài đợt → không truy vấn gì (không tốn request).
 */
export async function getSurveyPrompt(parentId: string, children: Pick<StudentRecord, "full_name" | "subjects">[]): Promise<SurveyPrompt | null> {
  const today = todayVN();
  if (!surveyWindowOpen(today) || children.length === 0) return null;
  const period = surveyPeriod(today);
  const supabase = await createClient();
  const { data, error } = await supabase.from("satisfaction_surveys").select("id").eq("parent_id", parentId).eq("period", period).maybeSingle();
  if (error || data) return null; // chưa có bảng (chưa chạy migration) hoặc đã trả lời
  const studied = new Set(children.flatMap((c) => enrolledSubjects(c)));
  return {
    period,
    subjects: (Object.keys(SURVEY_SUBJECTS) as SurveySubject[]).filter((s) => studied.has(s)),
    childNames: children.map((c) => givenName(c.full_name)),
  };
}

// ============================================================================ Thống kê cho quản trị viên

export type SurveyStats = {
  period: string;
  answered: number;
  declined: number;
  /** Phụ huynh đang có con học (mẫu số tỉ lệ phản hồi) */
  parents: number;
  average: number | null;
  /** % chấm 4–5 sao (CSAT) */
  csat: number | null;
  distribution: [number, number, number, number, number];
  subjects: { key: SurveySubject; average: number | null; count: number }[];
  byCampus: { campus: string; average: number; count: number }[];
  comments: { id: string; rating: number; comment: string; classNames: string[]; createdAt: string }[];
  trend: { period: string; average: number | null; count: number }[];
};

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export async function getSurveyStats(period: string): Promise<{ available: boolean; stats: SurveyStats | null }> {
  const supabase = await createClient();
  const from = addMonths(period, -5);
  const [rowsRes, parentsRes] = await Promise.all([
    supabase
      .from("satisfaction_surveys")
      .select("id, period, status, rating, subject_ratings, comment, campuses, class_names, created_at")
      .gte("period", from)
      .lte("period", period)
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase.from("students").select("parent_id").not("parent_id", "is", null),
  ]);
  if (rowsRes.error) {
    if (isMissing(rowsRes.error.code)) return { available: false, stats: null };
    throw new Error("Không tải được khảo sát", { cause: rowsRes.error });
  }
  const rows = rowsRes.data;
  const month = rows.filter((r) => r.period === period);
  const answered = month.filter((r) => r.status === "answered" && r.rating !== null);
  const ratings = answered.map((r) => r.rating!);

  const distribution: SurveyStats["distribution"] = [0, 0, 0, 0, 0];
  for (const r of ratings) distribution[r - 1]!++;

  const subjects = (Object.keys(SURVEY_SUBJECTS) as SurveySubject[]).map((key) => {
    const xs = answered
      .map((r) => (r.subject_ratings as Record<string, unknown>)?.[key])
      .filter((x): x is number => typeof x === "number");
    return { key, average: avg(xs), count: xs.length };
  });

  const campusMap = new Map<string, number[]>();
  for (const r of answered) for (const c of r.campuses) campusMap.set(c, [...(campusMap.get(c) ?? []), r.rating!]);

  const trend: SurveyStats["trend"] = [];
  for (let i = 5; i >= 0; i--) {
    const p = addMonths(period, -i);
    const xs = rows.filter((r) => r.period === p && r.status === "answered" && r.rating !== null).map((r) => r.rating!);
    trend.push({ period: p, average: avg(xs), count: xs.length });
  }

  return {
    available: true,
    stats: {
      period,
      answered: answered.length,
      declined: month.length - answered.length,
      parents: new Set((parentsRes.data ?? []).map((s) => s.parent_id)).size,
      average: avg(ratings),
      csat: ratings.length ? Math.round((ratings.filter((r) => r >= 4).length / ratings.length) * 100) : null,
      distribution,
      subjects,
      byCampus: [...campusMap.entries()].map(([campus, xs]) => ({ campus, average: avg(xs)!, count: xs.length })),
      comments: answered
        .filter((r) => r.comment)
        .map((r) => ({ id: r.id, rating: r.rating!, comment: r.comment!, classNames: r.class_names, createdAt: r.created_at })),
      trend,
    },
  };
}

/** 12 tháng gần nhất để chọn (mới nhất trước) */
export function recentPeriods(count = 12): string[] {
  const current = surveyPeriod(todayVN());
  return Array.from({ length: count }, (_, i) => addMonths(current, -i));
}
