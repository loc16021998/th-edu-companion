import type { Metadata } from "next";
import { BookCheck, Star } from "lucide-react";
import { todayVN } from "@/lib/date";
import { givenName } from "@/lib/utils";
import { getSelectedChild } from "@/features/parent/children";
import { NoChildren } from "@/features/parent/components/no-children";
import { getStarLeaderboard, listParentHomework } from "@/features/homework/queries";
import { ParentHomeworkCard } from "@/features/homework/components/parent-homework-card";
import { StarLeaderboard } from "@/features/homework/components/star-leaderboard";
import { MarkNotificationsRead } from "@/features/notifications/components/mark-read";

export const metadata: Metadata = { title: "Bài tập về nhà" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ParentHomeworkPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { child } = await getSelectedChild(params.child);
  if (!child) return <NoChildren />;

  const today = todayVN();
  const [homework, board] = await Promise.all([listParentHomework(child), getStarLeaderboard(child.campus, child.class_name, today)]);
  const name = givenName(child.full_name);

  const pending = homework.items.filter((i) => i.status === "pending");
  const submitted = homework.items.filter((i) => i.status === "submitted");
  const graded = homework.items.filter((i) => i.status === "graded");
  const totalStars = graded.reduce((sum, i) => sum + (i.submission?.stars ?? 0), 0);
  const weekStars = board.rows.find((r) => r.isMine)?.stars ?? 0;

  const sections = [
    { key: "pending", title: "Cần hoàn thành", items: pending, empty: `${name} đã làm hết bài rồi, giỏi quá! 🎉` },
    { key: "submitted", title: "Đã nộp — chờ cô chấm", items: submitted },
    { key: "graded", title: "Cô đã chấm", items: graded },
  ];

  return (
    <div className="space-y-4">
      {/* Đã mở trang → thông báo liên quan không còn hiện là mới */}
      <MarkNotificationsRead types={["homework_assigned", "homework_graded"]} studentId={child.id} />
      <div>
        <h1 className="text-xl font-extrabold">Góc Đồng Hành Tại Nhà</h1>
        <p className="text-sm text-muted-foreground">Bài tập về nhà của {name} — bố mẹ quay video/chụp ảnh bài làm gửi cô nhé.</p>
      </div>

      {!homework.available ? (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Tính năng bài tập về nhà đang được trung tâm cài đặt. Bố mẹ quay lại sau nhé!
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
              <p className="text-2xl font-extrabold tabular-nums">{pending.length}</p>
              <p className="text-xs font-medium text-muted-foreground">Chưa nộp</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
              <p className="flex items-center justify-center gap-1 text-2xl font-extrabold tabular-nums text-amber-700">
                <Star className="size-5 fill-amber-400 text-amber-400" />
                {weekStars}
              </p>
              <p className="text-xs font-medium text-amber-800">Sao tuần này</p>
            </div>
            <div className="rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
              <p className="text-2xl font-extrabold tabular-nums">{totalStars}</p>
              <p className="text-xs font-medium text-muted-foreground">Tổng sao</p>
            </div>
          </div>

          <StarLeaderboard rows={board.rows} from={board.from} to={board.to} />

          {homework.items.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card px-6 py-10 text-center">
              <BookCheck className="size-10 text-muted-foreground" />
              <p className="mt-2 font-semibold">Chưa có bài tập nào</p>
              <p className="mt-1 text-sm text-muted-foreground">Khi cô giao bài, bố mẹ sẽ nhận được thông báo ngay.</p>
            </div>
          ) : (
            sections.map(
              (s) =>
                (s.items.length > 0 || s.empty) && (
                  <section key={s.key} className="space-y-2">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                      {s.title} ({s.items.length})
                    </h2>
                    {s.items.length === 0 ? (
                      <p className="rounded-2xl bg-emerald-50 p-4 text-center text-sm font-medium text-emerald-800 ring-1 ring-emerald-200">{s.empty}</p>
                    ) : (
                      s.items.map((item) => <ParentHomeworkCard key={item.assignment.id} item={item} studentId={child.id} today={today} />)
                    )}
                  </section>
                ),
            )
          )}
        </>
      )}
    </div>
  );
}
