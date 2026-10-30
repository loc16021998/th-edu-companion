import "server-only";
import { createClient } from "@/lib/supabase/server";
import { FEED_CATEGORY_KEYS, type FeedCategory, type FeedFilter } from "./constants";

function isMissing(code: string | undefined) {
  return code === "PGRST205" || code === "42P01";
}

export type FeedItem = {
  id: string;
  category: FeedCategory;
  actorRole: "parent" | "teacher" | "system";
  actorName: string;
  title: string;
  body: string;
  href: string;
  count: number;
  createdAt: string;
  updatedAt: string;
  /** Chưa xem: cập nhật sau mốc "đã xem tất cả" và sau lần bấm xem mục này */
  isNew: boolean;
};

/** Mục còn "mới": cập nhật sau mốc đã xem tất cả và sau lần bấm xem mục đó (so sánh theo thời điểm, không theo chuỗi). */
function isUnread(updatedAt: string, seenAt: string, readAt: string | undefined) {
  const t = Date.parse(updatedAt);
  return t > Date.parse(seenAt) && !(readAt && Date.parse(readAt) >= t);
}

/** Mốc "đã xem" của quản trị viên (chưa có → coi như chưa xem gì trong 7 ngày gần đây). */
async function lastSeenAt(adminId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("admin_notification_state").select("last_seen_at").eq("admin_id", adminId).maybeSingle();
  return data?.last_seen_at ?? new Date(Date.now() - 7 * 86_400_000).toISOString();
}

export async function countUnreadAdminFeed(adminId: string): Promise<number> {
  const supabase = await createClient();
  // Đếm theo từng mục đã xem (migration admin-feed-reads); DB cũ → đếm theo mốc "đã xem tất cả"
  const rpc = await supabase.rpc("admin_feed_unread_count");
  if (!rpc.error) return rpc.data ?? 0;
  const seen = await lastSeenAt(adminId);
  const { count, error } = await supabase.from("admin_notifications").select("id", { count: "exact", head: true }).gt("updated_at", seen);
  return error ? 0 : (count ?? 0);
}

/** Bảng tin hoạt động (mới cập nhật trước) + mốc đã xem để tô "mới". */
export async function getAdminFeed(adminId: string, filter: FeedFilter, limit = 150) {
  const supabase = await createClient();
  let query = supabase
    .from("admin_notifications")
    .select("id, category, actor_role, actor_name, title, body, href, event_count, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (filter === "parent" || filter === "teacher") query = query.eq("actor_role", filter);
  else if (filter !== "all") query = query.eq("category", filter);

  const [res, seen, readsRes] = await Promise.all([
    query,
    lastSeenAt(adminId),
    supabase.from("admin_notification_reads").select("notification_id, read_at").eq("admin_id", adminId).limit(2000),
  ]);
  if (res.error) {
    if (isMissing(res.error.code)) return { available: false, items: [] as FeedItem[], lastSeenAt: seen };
    throw new Error("Không tải được thông báo", { cause: res.error });
  }
  const readAt = new Map((readsRes.error ? [] : readsRes.data).map((r) => [r.notification_id, r.read_at]));
  return {
    available: true,
    lastSeenAt: seen,
    items: res.data
      .filter((n) => (FEED_CATEGORY_KEYS as string[]).includes(n.category))
      .map(
        (n): FeedItem => ({
          id: n.id,
          category: n.category as FeedCategory,
          actorRole: n.actor_role === "teacher" ? "teacher" : n.actor_role === "system" ? "system" : "parent",
          actorName: n.actor_name,
          title: n.title,
          body: n.body,
          href: n.href,
          count: n.event_count,
          createdAt: n.created_at,
          updatedAt: n.updated_at,
          isNew: isUnread(n.updated_at, seen, readAt.get(n.id)),
        }),
      ),
  };
}
