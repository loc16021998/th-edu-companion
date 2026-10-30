import "server-only";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { requireRole } from "@/features/auth/queries";
import { getTeacherContext } from "@/features/teacher/queries";
import { NoClasses } from "@/features/teacher/components/no-classes";
import { MarkNotificationsRead } from "@/features/notifications/components/mark-read";
import { getMomentsFeed } from "../queries";
import { MomentComposer } from "../components/moment-composer";
import { MomentFeed } from "../components/moment-feed";

type Params = Record<string, string | string[] | undefined>;

/** Giáo viên (lớp phụ trách) / quản trị (mọi lớp — kiểm duyệt): đăng, xem, xoá khoảnh khắc. */
export async function StaffMomentsScreen({ params, basePath }: { params: Params; basePath: string }) {
  const profile = await requireRole("teacher", "admin");
  const { classes, selected: cls } = await getTeacherContext(params);
  if (!cls) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-extrabold">Góc khoảnh khắc</h1>
        <NoClasses />
      </div>
    );
  }
  const before = typeof params.before === "string" ? params.before : null;
  const feed = await getMomentsFeed({ campus: cls.campus, className: cls.className, viewerId: profile.id, before });
  const last = feed.items.at(-1);
  const classHref = (extra = "") => `${basePath}?class=${encodeURIComponent(cls.key)}${extra}`;
  const pill = (active: boolean) =>
    cn("shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold ring-1", active ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border hover:bg-muted");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {profile.role === "teacher" && <MarkNotificationsRead types={["moment_comment"]} />}
      <div>
        <h1 className="text-xl font-extrabold">Góc khoảnh khắc</h1>
        <p className="text-sm text-muted-foreground">Album hoạt động của lớp — chỉ phụ huynh có con học lớp này xem được.</p>
      </div>
      {classes.length > 1 && (
        <nav aria-label="Chọn lớp" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {classes.map((c) => (
            <Link
              key={c.key}
              href={`${basePath}?class=${encodeURIComponent(c.key)}`}
              className={pill(c.key === cls.key)}
              aria-current={c.key === cls.key ? "page" : undefined}
            >
              {c.label}
            </Link>
          ))}
        </nav>
      )}
      {!feed.available ? (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Database chưa có Góc khoảnh khắc — chạy file <code>supabase/apply-moments.sql</code>.
        </p>
      ) : (
        <>
          {!before && (
            <MomentComposer key={cls.key} classKey={cls.key} className={cls.className} students={cls.students.map((s) => ({ id: s.id, name: s.full_name }))} />
          )}
          <MomentFeed
            items={feed.items}
            viewer={{ id: profile.id, canManage: true, myChildIds: [] }}
            moreHref={feed.hasMore && last ? classHref(`&before=${encodeURIComponent(last.publishedAt)}`) : null}
          />
        </>
      )}
    </div>
  );
}
