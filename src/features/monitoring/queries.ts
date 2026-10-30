import "server-only";
import { createClient } from "@/lib/supabase/server";

const isMissing = (code: string) => ["PGRST205", "PGRST202", "42P01", "42883"].includes(code);

export type ErrorGroup = {
  fingerprint: string;
  message: string;
  category: string;
  source: string;
  level: string;
  areas: string[];
  paths: string[];
  count: number;
  users: number;
  firstSeen: string;
  lastSeen: string;
  digest: string | null;
  stack: string | null;
  release: string | null;
  context: unknown;
};

/** Lỗi trong `days` ngày gần đây, gom theo fingerprint (mới xảy ra gần nhất trước). Chỉ quản trị viên (RLS). */
export async function listErrorGroups(days = 7) {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("error_events")
    .select("fingerprint, message, category, source, level, area, path, user_id, created_at, digest, stack, release, context")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) {
    if (isMissing(error.code)) return { available: false as const, groups: [], total: 0 };
    throw new Error("Không tải được nhật ký lỗi", { cause: error });
  }
  const groups = new Map<string, ErrorGroup & { userSet: Set<string> }>();
  for (const e of data) {
    let g = groups.get(e.fingerprint);
    if (!g) {
      g = {
        fingerprint: e.fingerprint,
        message: e.message,
        category: e.category,
        source: e.source,
        level: e.level,
        areas: [],
        paths: [],
        count: 0,
        users: 0,
        userSet: new Set(),
        firstSeen: e.created_at,
        lastSeen: e.created_at,
        digest: e.digest,
        stack: e.stack,
        release: e.release,
        context: e.context,
      };
      groups.set(e.fingerprint, g);
    }
    g.count += 1;
    g.firstSeen = e.created_at;
    if (e.area && !g.areas.includes(e.area)) g.areas.push(e.area);
    if (e.path && g.paths.length < 5 && !g.paths.includes(e.path)) g.paths.push(e.path);
    if (e.user_id) g.userSet.add(e.user_id);
  }
  return {
    available: true as const,
    total: data.length,
    groups: [...groups.values()].map(({ userSet, ...g }) => ({ ...g, users: userSet.size })),
  };
}

export async function getIntegrityReport() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("integrity_report");
  if (error) {
    if (isMissing(error.code)) return { available: false as const, items: [] };
    throw new Error("Không chạy được báo cáo toàn vẹn dữ liệu", { cause: error });
  }
  return { available: true as const, items: data };
}
