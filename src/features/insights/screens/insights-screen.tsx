import "server-only";
import { Info } from "lucide-react";
import { getTeacherContext } from "@/features/teacher/queries";
import { NoClasses } from "@/features/teacher/components/no-classes";
import { InsightsBoard, type BoardItem } from "../components/insights-board";
import { getInsights, listSavedNotes } from "../queries";
import { RECENT_DAYS, WINDOW_DAYS, signalsFingerprint } from "../risk";

/**
 * Cảnh báo sớm — dùng chung cho giáo viên (/teacher/analytics: lớp mình phụ trách) và quản trị (/admin/insights: mọi lớp).
 * Cảnh báo tính trực tiếp mỗi lần mở trang → luôn theo dữ liệu mới nhất.
 */
export async function InsightsScreen({ mode }: { mode: "teacher" | "admin" }) {
  const { classes } = await getTeacherContext({});
  const students = classes.flatMap((c) => c.students);
  const title = mode === "teacher" ? "Cảnh báo sớm" : "Cảnh báo sớm toàn trung tâm";

  if (students.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-extrabold">{title}</h1>
        <NoClasses />
      </div>
    );
  }

  const [insights, saved] = await Promise.all([getInsights(students), listSavedNotes(students.map((s) => s.id))]);
  const items: BoardItem[] = insights.map((i) => ({ ...i, saved: saved[i.student.id] ?? {}, fingerprint: signalsFingerprint(i.risk.signals) }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">{title}</h1>
        <p className="text-sm text-muted-foreground">
          Tự động phân tích điểm danh, sổ liên lạc và bài tập {WINDOW_DAYS} ngày qua của {students.length} học sinh — bé cần lưu ý nhất ở đầu danh sách.
        </p>
      </div>
      <details className="group rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <summary className="flex cursor-pointer items-center gap-1.5 font-semibold">
          <Info className="size-3.5" aria-hidden /> Cách tính cảnh báo
        </summary>
        <ul className="mt-2 list-disc space-y-0.5 pl-5">
          <li>Nghỉ từ 3 buổi liên tiếp (kể cả có phép); hoặc nghỉ từ 4 buổi trong {WINDOW_DAYS} ngày.</li>
          <li>Điểm môn {RECENT_DAYS} ngày gần đây giảm từ 0,8★ so với trước đó và còn ≤ 3,5★; hoặc thấp kéo dài (≤ 2,5★); tiêu chí yếu được ghi kèm.</li>
          <li>Từ 3 buổi gần đây có nhận xét “cần cố gắng / chưa tập trung / hay nói chuyện…”; hoặc thường “Mệt mỏi”.</li>
          <li>Bài tập về nhà: từ một nửa số bài đã đến hạn chưa nộp hoặc nộp muộn.</li>
        </ul>
      </details>
      <InsightsBoard
        items={items}
        classes={classes.map((c) => ({ key: c.key, label: c.label }))}
        mode={mode}
        analyticsBase={mode === "teacher" ? "/teacher/student-analytics" : "/admin/student-analytics"}
      />
    </div>
  );
}
