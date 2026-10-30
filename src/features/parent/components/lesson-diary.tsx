import { MessageCircleHeart, NotebookPen } from "lucide-react";
import { relativeDayLabel } from "@/lib/date";
import type { LatestDailyReport } from "@/features/daily-reports/queries";
import { EmptyState, Section } from "./section";
import { SubjectList } from "./subject-list";

export function LessonDiary({ report, today }: { report: LatestDailyReport | null; today: string }) {
  return (
    <Section
      title="Nhật ký bài học"
      icon={NotebookPen}
      iconClassName="bg-rose-100 text-rose-600"
      aside={report ? relativeDayLabel(report.date, today) : undefined}
    >
      {!report ? (
        <EmptyState emoji="📒" title="Chưa có nhận xét" description="Cô giáo sẽ gửi nhận xét sau mỗi buổi học." />
      ) : (
        <div className="space-y-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
          <SubjectList subjects={report.subjects_summary} />

          {report.teacher_note && (
            <figure className="rounded-xl bg-gradient-to-br from-pink-50 to-orange-50 p-4 ring-1 ring-pink-100">
              <figcaption className="mb-1 flex items-center gap-1.5 text-xs font-bold text-pink-700">
                <MessageCircleHeart className="size-4" />
                Lời nhắn của cô{report.teacher?.full_name ? ` ${report.teacher.full_name}` : ""}
              </figcaption>
              {/* Nhận xét của cô — nội dung quan trọng nhất: chữ to hơn, đậm vừa */}
              <blockquote className="whitespace-pre-line text-base font-medium leading-relaxed text-slate-800">
                {report.teacher_note}
              </blockquote>
            </figure>
          )}
        </div>
      )}
    </Section>
  );
}
