"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { rateLimit, tooManyMessage } from "@/lib/security/rate-limit";
import { requireRole } from "@/features/auth/queries";
import { parseClassKey } from "@/features/teacher/classes";
import { schedulePushDelivery } from "@/features/push/deliver";
import type { ActionResult } from "@/types/action-result";
import { MAX_MOMENT_MEDIA, MOMENTS_BUCKET, MOMENT_CATEGORY_KEYS, MOMENT_PATH_RE, type MomentCategory } from "./constants";

const MIGRATION = "Database chưa có Góc Khoảnh Khắc — chạy file supabase/apply-moments.sql.";
const uuid = z.string().uuid();

function revalidateMoments() {
  revalidatePath("/parent/moments");
  revalidatePath("/teacher/moments");
  revalidatePath("/admin/moments");
}

// ============================================================================ Giáo viên: đăng bài

const draftSchema = z.object({
  classKey: z.string().min(1),
  category: z.enum(MOMENT_CATEGORY_KEYS as [MomentCategory, ...MomentCategory[]]),
  visibility: z.enum(["class", "tagged"]),
  caption: z.string().trim().max(2000, "Nội dung tối đa 2000 ký tự"),
});

/** Bước 1: tạo bài nháp (chưa ai thấy) để có thư mục tải ảnh/video lên. */
export async function createMomentDraft(input: z.input<typeof draftSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  const profile = await requireRole("teacher", "admin");
  const cls = parseClassKey(parsed.data.classKey);
  if (!cls) return { ok: false, error: "Lớp không hợp lệ." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("moments")
    .insert({
      campus: cls.campus,
      class_name: cls.className,
      author_id: profile.id,
      author_name: profile.full_name || (profile.role === "admin" ? "Trung tâm TH EDU" : "Giáo viên"),
      category: parsed.data.category,
      visibility: parsed.data.visibility,
      caption: parsed.data.caption,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "PGRST205") return { ok: false, error: MIGRATION };
    if (error.code === "42501") return { ok: false, error: "Bạn không phụ trách lớp này." };
    return { ok: false, error: dbErrorMessage(error) };
  }
  return { ok: true, data: { id: data.id } };
}

const publishSchema = z
  .object({
    momentId: uuid,
    media: z
      .array(z.object({ path: z.string().regex(MOMENT_PATH_RE, "Tệp không hợp lệ"), kind: z.enum(["image", "video"]), studentIds: z.array(uuid).max(60) }))
      .min(1, "Chọn ít nhất 1 ảnh / video")
      .max(MAX_MOMENT_MEDIA, `Tối đa ${MAX_MOMENT_MEDIA} ảnh / video mỗi bài`),
  })
  .refine((v) => v.media.every((m) => m.path.startsWith(`${v.momentId}/`)), { message: "Tệp không thuộc bài đăng" });

/** Bước 2: lưu ảnh/video + thẻ học sinh rồi đăng → phụ huynh nhận thông báo (trigger DB) + push. */
export async function publishMoment(input: z.input<typeof publishSchema>): Promise<ActionResult<null>> {
  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  await requireRole("teacher", "admin");
  const v = parsed.data;
  const supabase = await createClient();

  const { data: moment } = await supabase.from("moments").select("id, campus, class_name, visibility").eq("id", v.momentId).maybeSingle();
  if (!moment) return { ok: false, error: "Không tìm thấy bài đăng." };

  // Chỉ gắn thẻ học sinh đúng lớp của bài
  const wanted = [...new Set(v.media.flatMap((m) => m.studentIds))];
  let valid = new Set<string>();
  if (wanted.length) {
    const { data: students } = await supabase.from("students").select("id").in("id", wanted).eq("campus", moment.campus).eq("class_name", moment.class_name);
    valid = new Set((students ?? []).map((s) => s.id));
  }
  if (moment.visibility === "tagged" && valid.size === 0) return { ok: false, error: "Bài “Nhóm nhỏ” cần gắn thẻ ít nhất 1 bé (chỉ phụ huynh các bé đó xem được)." };

  const { data: media, error: mediaError } = await supabase
    .from("moment_media")
    .insert(v.media.map((m, i) => ({ moment_id: v.momentId, path: m.path, kind: m.kind, position: i })))
    .select("id, position");
  if (mediaError) return { ok: false, error: dbErrorMessage(mediaError) };

  const tags = media.flatMap((row) => v.media[row.position]!.studentIds.filter((id) => valid.has(id)).map((studentId) => ({ media_id: row.id, student_id: studentId })));
  if (tags.length) {
    const { error } = await supabase.from("moment_media_tags").insert(tags);
    if (error) return { ok: false, error: dbErrorMessage(error) };
  }

  const { error } = await supabase.from("moments").update({ published: true, published_at: new Date().toISOString() }).eq("id", v.momentId);
  if (error) return { ok: false, error: dbErrorMessage(error) };
  revalidateMoments();
  schedulePushDelivery();
  return { ok: true, data: null };
}

/** Xoá bài (cả nháp tải lỗi) + ảnh/video trong kho. */
export async function deleteMoment(momentId: string): Promise<ActionResult<null>> {
  if (!uuid.safeParse(momentId).success) return { ok: false, error: "Bài đăng không hợp lệ." };
  await requireRole("teacher", "admin");
  const supabase = await createClient();
  const { data: files } = await supabase.storage.from(MOMENTS_BUCKET).list(momentId, { limit: 200 });
  const { error } = await supabase.from("moments").delete().eq("id", momentId);
  if (error) return { ok: false, error: dbErrorMessage(error) };
  if (files?.length) await supabase.storage.from(MOMENTS_BUCKET).remove(files.map((f) => `${momentId}/${f.name}`));
  revalidateMoments();
  return { ok: true, data: null };
}

// ============================================================================ Tương tác

/** Thả / bỏ tim hoặc like. */
export async function toggleReaction(momentId: string, kind: "heart" | "like"): Promise<ActionResult<{ active: boolean }>> {
  if (!uuid.safeParse(momentId).success || !["heart", "like"].includes(kind)) return { ok: false, error: "Dữ liệu không hợp lệ." };
  const profile = await requireRole("parent", "teacher", "admin");
  const supabase = await createClient();
  const { data: existing } = await supabase.from("moment_reactions").select("kind").eq("moment_id", momentId).eq("user_id", profile.id).eq("kind", kind).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("moment_reactions").delete().eq("moment_id", momentId).eq("user_id", profile.id).eq("kind", kind);
    if (error) return { ok: false, error: dbErrorMessage(error) };
    return { ok: true, data: { active: false } };
  }
  const { error } = await supabase.from("moment_reactions").insert({ moment_id: momentId, user_id: profile.id, kind });
  if (error) return { ok: false, error: error.code === "42501" ? "Bạn không có quyền với bài đăng này." : dbErrorMessage(error) };
  return { ok: true, data: { active: true } };
}

export async function addMomentComment(
  momentId: string,
  body: string,
): Promise<ActionResult<{ id: string; authorId: string; authorLabel: string; authorRole: string; body: string; createdAt: string }>> {
  const text = body.trim();
  if (!uuid.safeParse(momentId).success) return { ok: false, error: "Bài đăng không hợp lệ." };
  if (!text || text.length > 500) return { ok: false, error: "Bình luận từ 1 đến 500 ký tự." };
  const profile = await requireRole("parent", "teacher", "admin");
  const limit = await rateLimit("comment", profile.id);
  if (!limit.ok) return { ok: false, error: tooManyMessage(limit.retryAfter) };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("moment_comments")
    .insert({ moment_id: momentId, author_id: profile.id, body: text })
    .select("id, author_id, author_label, author_role, body, created_at")
    .single();
  if (error) return { ok: false, error: error.code === "42501" ? "Bạn không có quyền bình luận bài này." : dbErrorMessage(error) };
  schedulePushDelivery();
  return { ok: true, data: { id: data.id, authorId: data.author_id, authorLabel: data.author_label, authorRole: data.author_role, body: data.body, createdAt: data.created_at } };
}

export async function deleteMomentComment(id: string): Promise<ActionResult<null>> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Bình luận không hợp lệ." };
  await requireRole("parent", "teacher", "admin");
  const supabase = await createClient();
  const { data, error } = await supabase.from("moment_comments").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: dbErrorMessage(error) };
  if (!data.length) return { ok: false, error: "Không xoá được bình luận này." };
  return { ok: true, data: null };
}
