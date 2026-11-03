/**
 * "Nhận xét chiều sâu 360°" soạn theo mẫu từ số liệu thật (dùng khi chưa bật AI / AI lỗi) — cùng bố cục 4 phần với bản AI.
 * Module thuần.
 */
import type { MonthData } from "@/features/monthly-summary/data";
import type { HomeworkRow, Signal } from "./risk";

export type HomeworkStats = { due: number; onTime: number; late: number; missing: number };

export function homeworkStats(rows: HomeworkRow[], today: string): HomeworkStats {
  const due = rows.filter((h) => h.dueDate < today);
  const missing = due.filter((h) => !h.submittedOn).length;
  const late = due.filter((h) => h.submittedOn && h.submittedOn > h.dueDate).length;
  return { due: due.length, onTime: due.length - missing - late, late, missing };
}

export function homeworkText(s: HomeworkStats): string {
  if (s.due === 0) return "chưa có bài tập nào đến hạn trong 30 ngày.";
  return `${s.due} bài đã đến hạn: ${s.onTime} bài nộp đúng hạn, ${s.late} bài nộp muộn, ${s.missing} bài chưa nộp.`;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function buildTemplate360(d: MonthData, hw: HomeworkStats, signals: Signal[]): string {
  const rated = d.subjects.flatMap((s) => s.criteria.filter((c) => c.avg !== null).map((c) => ({ ...c, avg: c.avg as number, subject: s.name })));
  const strong = [...rated].sort((a, b) => b.avg - a.avg).filter((c) => c.avg >= 4).slice(0, 3);
  const weak = [...rated].sort((a, b) => a.avg - b.avg).filter((c) => c.avg < 3.5).slice(0, 2);
  const focusIssue = signals.some((s) => s.kind === "low_focus");

  const strengths = strong.length
    ? `🌟 Điểm mạnh của con:\nBé ${d.childName} làm tốt ${strong.map((s) => `${lower(s.label)} (${s.subject})`).join(", ")}. Cô mong Ba mẹ khen ngợi để con thêm tự tin.`
    : `🌟 Điểm mạnh của con:\nBé ${d.childName} tham gia đầy đủ các hoạt động trên lớp với tinh thần tích cực; cô đang theo dõi thêm để ghi nhận điểm mạnh nổi bật của con.`;

  const improve = weak.length || focusIssue
    ? `🌱 Điều con cần cải thiện:\n${[
        weak.length ? `Con cần rèn thêm ${weak.map((s) => `${lower(s.label)} (${s.subject})`).join(" và ")}.` : "",
        focusIssue ? "Con đôi lúc chưa tập trung trọn vẹn trong giờ học." : "",
        "Trên lớp, cô đang kèm thêm từng bước nhỏ để con tiến bộ đều.",
      ]
        .filter(Boolean)
        .join(" ")}`
    : "🌱 Điều con cần cải thiện:\nHiện chưa có kỹ năng nào đáng lo; cô sẽ tiếp tục giao bài vừa sức để con phát triển đều các môn.";

  const { present, late, absent, excused } = d.attendance;
  const total = present + late + absent + excused;
  const attendance = `📅 Chuyên cần & bài tập về nhà:\n${
    total ? `Trong 30 ngày, con đi học ${present + late}/${total} buổi${late ? ` (${late} buổi đến muộn)` : ""}${absent + excused ? `, nghỉ ${absent + excused} buổi` : ""}.` : "Cô chưa có đủ dữ liệu điểm danh trong 30 ngày."
  } Bài tập về nhà: ${homeworkText(hw)}`;

  const tips: string[] = [];
  const has = (label: string) => weak.some((w) => w.label === label);
  if (has("Nhận biết mặt chữ") || has("Ghép vần")) tips.push("Cùng con đọc to 5–10 phút mỗi tối, chỉ tay theo từng chữ.");
  if (has("Khả năng tập trung") || focusIssue) tips.push("Cho con làm trọn vẹn một việc trong 10 phút, không điện thoại, tivi.");
  if (has("Độ đều nét") || has("Khoảng cách chữ") || has("Tư thế ngồi & cầm bút")) tips.push("Cho con viết 3–5 dòng chữ mẫu mỗi ngày, nhắc ngồi thẳng lưng, cầm bút đúng.");
  if (has("Khả năng tính nhẩm") || has("Tốc độ phản xạ") || has("Logic hình khối")) tips.push("Chơi đố tính nhẩm nhanh 5 phút hoặc xếp hình cùng con cuối tuần.");
  if (hw.missing + hw.late > 0) tips.push("Dành 10 phút cố định mỗi tối để con làm và nộp bài tập đúng hạn.");
  if (tips.length === 0) tips.push("Dành 10–15 phút mỗi tối trò chuyện, cùng con ôn lại bài trên lớp.", "Khuyến khích con đọc sách tranh và kể lại cho Ba mẹ nghe.");
  const home = `🏡 Ba mẹ đồng hành cùng con tại nhà:\n${tips.slice(0, 3).map((t) => `- ${t}`).join("\n")}\nCảm ơn Ba mẹ đã luôn đồng hành cùng con và cô!`;

  return [strengths, improve, attendance, home].join("\n\n");
}
