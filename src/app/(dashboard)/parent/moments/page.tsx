import type { Metadata } from "next";
import Link from "next/link";
import { cn, givenName } from "@/lib/utils";
import { requireRole } from "@/features/auth/queries";
import { childHref, getSelectedChild } from "@/features/parent/children";
import { NoChildren } from "@/features/parent/components/no-children";
import { MarkNotificationsRead } from "@/features/notifications/components/mark-read";
import { getMomentsFeed } from "@/features/moments/queries";
import { MomentFeed } from "@/features/moments/components/moment-feed";

export const metadata: Metadata = { title: "Góc khoảnh khắc" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ParentMomentsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const profile = await requireRole("parent");
  const { students, child } = await getSelectedChild(params.child);
  if (!child) return <NoChildren />;

  const mine = params.f === "mine";
  const before = typeof params.before === "string" ? params.before : null;
  const feed = await getMomentsFeed({
    campus: child.campus,
    className: child.class_name,
    viewerId: profile.id,
    taggedStudentId: mine ? child.id : null,
    before,
  });
  const childId = students.length > 1 ? child.id : undefined;
  const last = feed.items.at(-1);
  const tab = (active: boolean) => cn("rounded-lg px-3 py-1.5 text-center text-sm font-semibold", active ? "bg-card shadow-sm" : "text-muted-foreground");

  return (
    <div className="space-y-4">
      <MarkNotificationsRead types={["moment_posted", "moment_comment"]} studentId={child.id} />
      <div>
        <h1 className="text-xl font-extrabold">Góc khoảnh khắc</h1>
        <p className="text-sm text-muted-foreground">
          Ảnh & video hoạt động lớp {child.class_name} — chỉ phụ huynh trong lớp xem được. Chạm ảnh để xem và tải ảnh gốc.
        </p>
      </div>
      <nav className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" aria-label="Lọc khoảnh khắc">
        <Link href={childHref("/parent/moments", childId)} className={tab(!mine)} aria-current={!mine ? "page" : undefined}>
          Cả lớp
        </Link>
        <Link href={childHref("/parent/moments", childId, { f: "mine" })} className={tab(mine)} aria-current={mine ? "page" : undefined}>
          Có bé {givenName(child.full_name)} 💕
        </Link>
      </nav>
      {!feed.available ? (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">Góc khoảnh khắc đang được trung tâm cài đặt.</p>
      ) : (
        <MomentFeed
          items={feed.items}
          viewer={{ id: profile.id, canManage: false, myChildIds: students.map((s) => s.id) }}
          moreHref={feed.hasMore && last ? childHref("/parent/moments", childId, { f: mine ? "mine" : undefined, before: last.publishedAt }) : null}
        />
      )}
    </div>
  );
}
