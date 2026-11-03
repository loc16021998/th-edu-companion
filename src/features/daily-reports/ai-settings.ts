import "server-only";
import { createClient } from "@/lib/supabase/server";
import { todayVN, addDays } from "@/lib/date";

/** Bảng chưa có (chưa chạy supabase/apply-report-ai-assistant.sql) → dùng mặc định, không làm hỏng trang. */
const isMissing = (code: string) => ["PGRST205", "PGRST202", "42P01", "42703"].includes(code);

export type ReportAiSettings = {
  /** false: chưa chạy file SQL — trợ lý vẫn chạy với cài đặt mặc định, trang quản lý hiện hướng dẫn cài đặt */
  available: boolean;
  /** Hiện khung trợ lý cho giáo viên */
  assistantEnabled: boolean;
  /** Gọi AI; tắt → chỉ gợi ý soạn theo mẫu */
  aiEnabled: boolean;
  /** Lưu ý văn phong của trung tâm, thêm vào hướng dẫn cho AI */
  styleNote: string;
  updatedAt: string | null;
};

const DEFAULTS: ReportAiSettings = { available: false, assistantEnabled: true, aiEnabled: true, styleNote: "", updatedAt: null };

export async function getReportAiSettings(): Promise<ReportAiSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("report_ai_settings").select("assistant_enabled, ai_enabled, style_note, updated_at").maybeSingle();
  if (error) {
    if (!isMissing(error.code)) console.error("[ai-settings] Không đọc được cài đặt:", error);
    return DEFAULTS;
  }
  if (!data) return { ...DEFAULTS, available: true };
  return { available: true, assistantEnabled: data.assistant_enabled, aiEnabled: data.ai_enabled, styleNote: data.style_note ?? "", updatedAt: data.updated_at };
}

export type NoteTemplate = { id: string; content: string; active: boolean; createdAt: string };

/** Câu mẫu chung của trung tâm. Giáo viên (RLS) chỉ thấy câu đang bật; quản trị thấy tất cả. */
export async function listNoteTemplates(): Promise<NoteTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("report_note_templates").select("id, content, active, created_at").order("created_at", { ascending: false }).limit(200);
  if (error) {
    if (!isMissing(error.code)) console.error("[ai-settings] Không đọc được câu mẫu:", error);
    return [];
  }
  return data.map((t) => ({ id: t.id, content: t.content, active: t.active, createdAt: t.created_at }));
}

export type AiUsageStats = {
  days: number;
  total: number;
  ai: number;
  template: number;
  people: { id: string; name: string; role: string; total: number; ai: number }[];
  /** Số lượt theo ngày (cũ → mới), đủ mọi ngày trong khoảng */
  daily: { date: string; total: number }[];
};

/** Thống kê lượt bấm gợi ý trong `days` ngày gần nhất (chỉ quản trị đọc được nhật ký — RLS). */
export async function getAiUsageStats(days = 30): Promise<AiUsageStats> {
  const today = todayVN();
  const from = addDays(today, -(days - 1));
  const empty: AiUsageStats = { days, total: 0, ai: 0, template: 0, people: [], daily: [] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_note_events")
    .select("actor_id, source, created_at, actor:profiles!ai_note_events_actor_id_fkey(full_name, role)")
    .gte("created_at", `${from}T00:00:00+07:00`)
    .order("created_at", { ascending: true })
    .limit(20_000);
  if (error) {
    if (!isMissing(error.code)) console.error("[ai-settings] Không đọc được thống kê:", error);
    return empty;
  }

  const people = new Map<string, AiUsageStats["people"][number]>();
  const byDay = new Map<string, number>();
  let ai = 0;
  for (const e of data) {
    if (e.source === "ai") ai++;
    const actor = Array.isArray(e.actor) ? e.actor[0] : e.actor;
    const p = people.get(e.actor_id) ?? { id: e.actor_id, name: actor?.full_name ?? "Tài khoản đã xoá", role: actor?.role ?? "", total: 0, ai: 0 };
    p.total++;
    if (e.source === "ai") p.ai++;
    people.set(e.actor_id, p);
    const day = new Date(e.created_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const daily = Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    return { date, total: byDay.get(date) ?? 0 };
  });
  return {
    days,
    total: data.length,
    ai,
    template: data.length - ai,
    people: [...people.values()].sort((a, b) => b.total - a.total),
    daily,
  };
}
