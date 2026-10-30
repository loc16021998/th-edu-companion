import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database.types";
import { MOMENTS_BUCKET, type MomentCategory, type MomentVisibility } from "./constants";

function isMissing(code: string | undefined) {
  return code === "PGRST205" || code === "42P01" || code === "PGRST202";
}

export type MomentMediaItem = { id: string; path: string; kind: "image" | "video"; url: string | null; tags: { studentId: string; name: string }[] };
export type MomentComment = { id: string; authorId: string; authorLabel: string; authorRole: string; body: string; createdAt: string };
export type MomentItem = {
  id: string;
  authorId: string | null;
  authorName: string;
  category: MomentCategory;
  visibility: MomentVisibility;
  caption: string;
  publishedAt: string;
  media: MomentMediaItem[];
  /** Các bé được gắn thẻ trong cả bài (không trùng) */
  tagged: { studentId: string; name: string }[];
  reactions: { heart: number; like: number; mine: { heart: boolean; like: boolean } };
  comments: MomentComment[];
};

const PAGE = 12;

/**
 * Bảng tin khoảnh khắc của 1 lớp (RLS can_view_moment quyết định: phụ huynh chỉ thấy bài lớp con mình,
 * bài "nhóm nhỏ" chỉ khi con được gắn thẻ). `taggedStudentId`: chỉ bài có ảnh gắn thẻ bé này. `before`: phân trang.
 */
export async function getMomentsFeed(opts: {
  campus: Enums<"campus">;
  className: string;
  viewerId: string;
  taggedStudentId?: string | null;
  before?: string | null;
}): Promise<{ available: boolean; items: MomentItem[]; hasMore: boolean }> {
  const supabase = await createClient();

  let onlyIds: string[] | null = null;
  if (opts.taggedStudentId) {
    const { data, error } = await supabase.from("moment_media_tags").select("media:moment_media!inner(moment_id)").eq("student_id", opts.taggedStudentId);
    if (error) {
      if (isMissing(error.code)) return { available: false, items: [], hasMore: false };
      throw new Error("Không tải được khoảnh khắc", { cause: error });
    }
    onlyIds = [...new Set((data as unknown as { media: { moment_id: string } }[]).map((d) => d.media.moment_id))];
    if (onlyIds.length === 0) return { available: true, items: [], hasMore: false };
  }

  let query = supabase
    .from("moments")
    .select("id, author_id, author_name, category, visibility, caption, published_at, created_at")
    .eq("campus", opts.campus)
    .eq("class_name", opts.className)
    .eq("published", true)
    .order("published_at", { ascending: false })
    .limit(PAGE + 1);
  if (opts.before) query = query.lt("published_at", opts.before);
  if (onlyIds) query = query.in("id", onlyIds);
  const { data: rows, error } = await query;
  if (error) {
    if (isMissing(error.code)) return { available: false, items: [], hasMore: false };
    throw new Error("Không tải được khoảnh khắc", { cause: error });
  }
  const hasMore = rows.length > PAGE;
  const moments = rows.slice(0, PAGE);
  if (moments.length === 0) return { available: true, items: [], hasMore: false };
  const ids = moments.map((m) => m.id);

  const [mediaRes, tagsRes, reactRes, commentRes] = await Promise.all([
    supabase.from("moment_media").select("id, moment_id, path, kind, position").in("moment_id", ids).order("position"),
    supabase.rpc("moment_tag_names", { p_moment_ids: ids }),
    supabase.from("moment_reactions").select("moment_id, user_id, kind").in("moment_id", ids),
    supabase
      .from("moment_comments")
      .select("id, moment_id, author_id, author_label, author_role, body, created_at")
      .in("moment_id", ids)
      .order("created_at")
      .limit(600),
  ]);
  const media = mediaRes.data ?? [];

  // Ảnh: ký URL 1 giờ (kho private); video: ký riêng để phát
  const signed = new Map<string, string>();
  if (media.length) {
    const { data } = await supabase.storage.from(MOMENTS_BUCKET).createSignedUrls(media.map((m) => m.path), 60 * 60);
    for (const d of data ?? []) if (d.path && d.signedUrl && !d.error) signed.set(d.path, d.signedUrl);
  }

  const tagsByMedia = new Map<string, { studentId: string; name: string }[]>();
  for (const t of tagsRes.data ?? []) tagsByMedia.set(t.media_id, [...(tagsByMedia.get(t.media_id) ?? []), { studentId: t.student_id, name: t.given_name }]);

  return {
    available: true,
    hasMore,
    items: moments.map((m) => {
      const mm = media.filter((x) => x.moment_id === m.id);
      const tagged = new Map<string, string>();
      for (const x of mm) for (const t of tagsByMedia.get(x.id) ?? []) tagged.set(t.studentId, t.name);
      const reacts = (reactRes.data ?? []).filter((r) => r.moment_id === m.id);
      return {
        id: m.id,
        authorId: m.author_id,
        authorName: m.author_name,
        category: m.category as MomentCategory,
        visibility: m.visibility as MomentVisibility,
        caption: m.caption,
        publishedAt: m.published_at ?? m.created_at,
        media: mm.map((x) => ({ id: x.id, path: x.path, kind: x.kind === "video" ? "video" : "image", url: signed.get(x.path) ?? null, tags: tagsByMedia.get(x.id) ?? [] })),
        tagged: [...tagged.entries()].map(([studentId, name]) => ({ studentId, name })),
        reactions: {
          heart: reacts.filter((r) => r.kind === "heart").length,
          like: reacts.filter((r) => r.kind === "like").length,
          mine: {
            heart: reacts.some((r) => r.kind === "heart" && r.user_id === opts.viewerId),
            like: reacts.some((r) => r.kind === "like" && r.user_id === opts.viewerId),
          },
        },
        comments: (commentRes.data ?? [])
          .filter((c) => c.moment_id === m.id)
          .map((c) => ({ id: c.id, authorId: c.author_id, authorLabel: c.author_label, authorRole: c.author_role, body: c.body, createdAt: c.created_at })),
      };
    }),
  };
}
