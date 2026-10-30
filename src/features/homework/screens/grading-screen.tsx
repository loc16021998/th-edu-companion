import "server-only";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTeacherContext } from "@/features/teacher/queries";
import { NoClasses } from "@/features/teacher/components/no-classes";
import { getStarLeaderboard, listClassAssignments, listSubmissionsForGrading } from "../queries";
import { AssignmentForm, AssignmentList } from "../components/assignment-form";
import { GradingCard } from "../components/grading-card";
import { StarLeaderboard } from "../components/star-leaderboard";

type Params = Record<string, string | string[] | undefined>;

const TABS = [
  { key: "grade", label: "Chấm bài" },
  { key: "assign", label: "Giao bài" },
  { key: "stars", label: "Ngôi sao tuần" },
] as const;
type Tab = (typeof TABS)[number]["key"];

/** Màn "Cô chấm bài & thưởng sao" — `basePath`: /teacher/grading (hoặc trang admin dùng lại). */
export async function GradingScreen({ params, basePath }: { params: Params; basePath: string }) {
  const { today, classes, selected: cls } = await getTeacherContext(params);
  if (!cls) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-extrabold">Chấm bài & thưởng sao</h1>
        <NoClasses />
      </div>
    );
  }

  const tab: Tab = TABS.some((t) => t.key === params.tab) ? (params.tab as Tab) : "grade";
  const view = params.view === "graded" ? "graded" : "submitted";
  const href = (next: { class?: string; tab?: Tab; view?: string }) => {
    const q = new URLSearchParams({ class: next.class ?? cls.key });
    const t = next.tab ?? tab;
    if (t !== "grade") q.set("tab", t);
    if (t === "grade" && (next.view ?? view) === "graded") q.set("view", "graded");
    return `${basePath}?${q}`;
  };

  const [waiting, assignments, board] = await Promise.all([
    listSubmissionsForGrading(cls.campus, cls.className, "submitted"),
    tab === "assign" ? listClassAssignments(cls.campus, cls.className) : null,
    tab === "stars" ? getStarLeaderboard(cls.campus, cls.className, today) : null,
  ]);
  const graded = tab === "grade" && view === "graded" ? await listSubmissionsForGrading(cls.campus, cls.className, "graded") : null;

  const pill = (active: boolean) =>
    cn("shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold ring-1 transition-colors", active ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border hover:bg-muted");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Chấm bài & thưởng sao</h1>

      {!waiting.available ? (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Database chưa có bảng bài tập — nhờ quản trị viên chạy file <code>supabase/apply-homework.sql</code>.
        </p>
      ) : (
        <>
          {classes.length > 1 && (
            <nav aria-label="Chọn lớp" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {classes.map((c) => (
                <Link key={c.key} href={href({ class: c.key })} className={pill(c.key === cls.key)} aria-current={c.key === cls.key ? "page" : undefined}>
                  {c.label}
                </Link>
              ))}
            </nav>
          )}

          <div role="tablist" className="grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1">
            {TABS.map((t) => (
              <Link
                key={t.key}
                role="tab"
                aria-selected={t.key === tab}
                href={href({ tab: t.key })}
                className={cn("rounded-xl px-2 py-2 text-center text-sm font-semibold", t.key === tab ? "bg-card shadow-sm" : "text-muted-foreground")}
              >
                {t.label}
                {t.key === "grade" && waiting.items.length > 0 && (
                  <span className="ml-1 rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white">{waiting.items.length}</span>
                )}
              </Link>
            ))}
          </div>

          {tab === "grade" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Link href={href({ view: "submitted" })} className={pill(view === "submitted")}>
                  Chờ chấm ({waiting.items.length})
                </Link>
                <Link href={href({ view: "graded" })} className={pill(view === "graded")}>
                  Đã chấm gần đây
                </Link>
              </div>
              {(() => {
                const list = view === "graded" ? (graded?.items ?? []) : waiting.items;
                if (list.length === 0)
                  return (
                    <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card px-6 py-10 text-center">
                      <ClipboardCheck className="size-10 text-muted-foreground" />
                      <p className="mt-2 font-semibold">{view === "graded" ? "Chưa chấm bài nào" : "Không còn bài chờ chấm 🎉"}</p>
                      <p className="mt-1 text-sm text-muted-foreground">Phụ huynh nộp bài sẽ hiện ở đây.</p>
                    </div>
                  );
                return list.map((item) => <GradingCard key={`${item.id}-${item.gradedAt ?? ""}`} item={item} />);
              })()}
            </div>
          )}

          {tab === "assign" && assignments && (
            <div className="space-y-4">
              <AssignmentForm classKey={cls.key} className={cls.className} today={today} />
              <section className="space-y-2">
                <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Bài đã giao</h2>
                <AssignmentList items={assignments.items} today={today} />
              </section>
            </div>
          )}

          {tab === "stars" && board && (
            <div className="space-y-2">
              <StarLeaderboard rows={board.rows} from={board.from} to={board.to} limit={50} />
              <p className="text-xs text-muted-foreground">Tính theo số sao cô tặng trong tuần (Thứ 2 → Chủ nhật). Phụ huynh thấy bảng này với tên gọi của các bé.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
