"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { uuidSchema } from "@/lib/validation";
import { requireRole } from "@/features/auth/queries";
import type { ActionResult } from "@/types/action-result";

/** Quản trị → Sổ liên lạc → Quản lý Trợ lý viết nhận xét. Chỉ quản trị (RLS cũng chặn ở database). */

const NOT_INSTALLED = "Chưa cài đặt phần quản lý Trợ lý — chạy file supabase/apply-report-ai-assistant.sql trong Supabase SQL Editor.";

function errorText(error: { code: string; message: string }) {
  if (["PGRST205", "42P01"].includes(error.code)) return NOT_INSTALLED;
  return dbErrorMessage(error);
}

function revalidateAssistant() {
  revalidatePath("/admin/daily-report", "layout");
  revalidatePath("/teacher/daily-report");
}

const settingsSchema = z.object({
  assistantEnabled: z.boolean(),
  aiEnabled: z.boolean(),
  styleNote: z.string().trim().max(500, "Lưu ý văn phong tối đa 500 ký tự"),
});

export async function saveReportAiSettings(input: z.input<typeof settingsSchema>): Promise<ActionResult<null>> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  const profile = await requireRole("admin");
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("report_ai_settings").upsert({
    id: true,
    assistant_enabled: v.assistantEnabled,
    ai_enabled: v.aiEnabled,
    style_note: v.styleNote.replace(/\s+/g, " ") || null,
    updated_at: new Date().toISOString(),
    updated_by: profile.id,
  });
  if (error) return { ok: false, error: errorText(error) };
  revalidateAssistant();
  return { ok: true, data: null };
}

const contentSchema = z
  .string()
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(10, "Câu mẫu cần ít nhất 10 ký tự").max(600, "Câu mẫu tối đa 600 ký tự"));

export async function createNoteTemplate(content: string): Promise<ActionResult<{ id: string }>> {
  const parsed = contentSchema.safeParse(content);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Câu mẫu không hợp lệ." };
  await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase.from("report_note_templates").insert({ content: parsed.data }).select("id").single();
  if (error) return { ok: false, error: errorText(error) };
  revalidateAssistant();
  return { ok: true, data: { id: data.id } };
}

const updateSchema = z.object({ id: uuidSchema, content: contentSchema.optional(), active: z.boolean().optional() });

export async function updateNoteTemplate(input: z.input<typeof updateSchema>): Promise<ActionResult<null>> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Câu mẫu không hợp lệ." };
  await requireRole("admin");
  const { id, content, active } = parsed.data;
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("report_note_templates")
    .update({ ...(content !== undefined && { content }), ...(active !== undefined && { active }), updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", id);
  if (error) return { ok: false, error: errorText(error) };
  if (!count) return { ok: false, error: "Không tìm thấy câu mẫu (có thể đã bị xoá)." };
  revalidateAssistant();
  return { ok: true, data: null };
}

export async function deleteNoteTemplate(id: string): Promise<ActionResult<null>> {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Câu mẫu không hợp lệ." };
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.from("report_note_templates").delete().eq("id", parsed.data);
  if (error) return { ok: false, error: errorText(error) };
  revalidateAssistant();
  return { ok: true, data: null };
}
