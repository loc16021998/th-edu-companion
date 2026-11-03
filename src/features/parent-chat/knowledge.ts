import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { KnowledgeArticle } from "./knowledge-shared";

const isMissing = (code: string) => ["PGRST205", "PGRST202", "42P01", "42703"].includes(code);

export type KnowledgeRow = KnowledgeArticle & { active: boolean; updatedAt: string };

/** Bài trong kho kiến thức. Phụ huynh / giáo viên (RLS) chỉ thấy bài đang bật; quản trị thấy tất cả. */
export async function listKnowledge(): Promise<{ available: boolean; items: KnowledgeRow[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge_articles")
    .select("id, title, category, content, active, updated_at")
    .order("category")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) {
    if (isMissing(error.code)) return { available: false, items: [] };
    throw new Error("Không tải được kho kiến thức", { cause: error });
  }
  return {
    available: true,
    items: data.map((a) => ({ id: a.id, title: a.title, category: a.category, content: a.content, active: a.active, updatedAt: a.updated_at })),
  };
}

/** Bài đang bật, dùng cho trợ lý. Lỗi → [] (trợ lý vẫn trả lời bằng dữ liệu của con + thông tin chung). */
export async function activeKnowledge(): Promise<KnowledgeArticle[]> {
  try {
    const { items } = await listKnowledge();
    return items.filter((a) => a.active);
  } catch (err) {
    console.error("[parent-chat] Không đọc được kho kiến thức:", err);
    return [];
  }
}
