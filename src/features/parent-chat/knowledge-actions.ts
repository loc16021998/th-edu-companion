"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { uuidSchema } from "@/lib/validation";
import { requireRole } from "@/features/auth/queries";
import type { ActionResult } from "@/types/action-result";
import { DRAFT_ARTICLES, KNOWLEDGE_CATEGORY_KEYS } from "./knowledge-shared";

/** Quản trị → Kho kiến thức Trợ lý AI. Chỉ quản trị (RLS cũng chặn ở database). */

const NOT_INSTALLED = "Chưa cài đặt Kho kiến thức — chạy file supabase/apply-knowledge-base.sql trong Supabase SQL Editor.";
const errorText = (error: { code: string; message: string }) => (["PGRST205", "42P01"].includes(error.code) ? NOT_INSTALLED : dbErrorMessage(error));
const revalidate = () => revalidatePath("/admin/ai-knowledge");

const articleSchema = z.object({
  title: z.string().trim().min(3, "Tiêu đề cần ít nhất 3 ký tự").max(150, "Tiêu đề tối đa 150 ký tự"),
  category: z.enum(KNOWLEDGE_CATEGORY_KEYS),
  content: z.string().trim().min(10, "Nội dung cần ít nhất 10 ký tự").max(8000, "Nội dung tối đa 8000 ký tự"),
  active: z.boolean(),
});

export async function createArticle(input: z.input<typeof articleSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = articleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Bài viết không hợp lệ." };
  const profile = await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge_articles")
    .insert({ ...parsed.data, updated_by: profile.id })
    .select("id")
    .single();
  if (error) return { ok: false, error: errorText(error) };
  revalidate();
  return { ok: true, data: { id: data.id } };
}

const updateSchema = articleSchema.partial().extend({ id: uuidSchema });

export async function updateArticle(input: z.input<typeof updateSchema>): Promise<ActionResult<null>> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Bài viết không hợp lệ." };
  const profile = await requireRole("admin");
  const { id, ...fields } = parsed.data;
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("knowledge_articles")
    .update({ ...fields, updated_by: profile.id, updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", id);
  if (error) return { ok: false, error: errorText(error) };
  if (!count) return { ok: false, error: "Không tìm thấy bài viết (có thể đã bị xoá)." };
  revalidate();
  return { ok: true, data: null };
}

export async function deleteArticle(id: string): Promise<ActionResult<null>> {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Bài viết không hợp lệ." };
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.from("knowledge_articles").delete().eq("id", parsed.data);
  if (error) return { ok: false, error: errorText(error) };
  revalidate();
  return { ok: true, data: null };
}

/** Thêm bộ bài NHÁP gợi ý (đang tắt — quản trị sửa cho đúng quy định thật rồi mới bật). Bỏ qua bài trùng tiêu đề. */
export async function addDraftArticles(): Promise<ActionResult<{ added: number }>> {
  const profile = await requireRole("admin");
  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase.from("knowledge_articles").select("title");
  if (readError) return { ok: false, error: errorText(readError) };
  const have = new Set(existing.map((a) => a.title.trim().toLowerCase()));
  const rows = DRAFT_ARTICLES.filter((d) => !have.has(d.title.toLowerCase())).map((d) => ({ ...d, active: false, updated_by: profile.id }));
  if (rows.length === 0) return { ok: true, data: { added: 0 } };
  const { error } = await supabase.from("knowledge_articles").insert(rows);
  if (error) return { ok: false, error: errorText(error) };
  revalidate();
  return { ok: true, data: { added: rows.length } };
}
