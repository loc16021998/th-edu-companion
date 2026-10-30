import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { fullDate } from "@/lib/date";
import { monthDataToText, type MonthData } from "./data";

const MODEL = "claude-opus-5-5";

const SYSTEM = `Bạn là giáo viên chủ nhiệm tại trung tâm TH EDU, viết "Nhận xét tổng kết tháng" gửi phụ huynh.

Yêu cầu:
- Tiếng Việt, văn phong sư phạm thân thiện, ấm áp, tích cực; gọi phụ huynh là "Ba mẹ", gọi học sinh là "con" hoặc "bé <tên>".
- CHỈ dựa vào dữ liệu được cung cấp. Không bịa thêm hoạt động, con số, sự kiện. Thiếu dữ liệu ở môn nào thì nói nhẹ nhàng là giáo viên sẽ theo dõi thêm.
- Bố cục 4 đoạn ngắn, không tiêu đề, không markdown, không gạch đầu dòng:
  1) Tổng quan tháng: tinh thần, chuyên cần (nhắc số buổi nếu có ý nghĩa).
  2) Điểm mạnh: khen cụ thể dựa trên tiêu chí điểm cao / nhận xét tốt.
  3) Điểm cần rèn thêm: diễn đạt tế nhị, mang tính xây dựng, dựa trên tiêu chí điểm thấp.
  4) Gợi ý 2–3 hoạt động ngắn, dễ làm cùng con tại nhà (5–15 phút/ngày), sát với điểm cần rèn; kết bằng một lời động viên.
- Độ dài 170–260 từ. Viết thành văn xuôi tự nhiên, không liệt kê điểm số khô khan (có thể nhắc tiến bộ/điểm nổi bật).`;

export class SummaryAiUnavailable extends Error {}

/** Claude soạn bản nháp. Lỗi / bị từ chối / chưa cấu hình → SummaryAiUnavailable (bên gọi dùng bản mẫu). */
export async function generateSummaryWithClaude(data: MonthData): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new SummaryAiUnavailable("Chưa cấu hình ANTHROPIC_API_KEY");
  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      // Văn bản ngắn cần chất lượng diễn đạt → effort vừa phải
      output_config: { effort: "medium" },
      // Bộ phân loại an toàn có thể từ chối nhầm → chạy lại trên model dự phòng Anthropic khuyến nghị
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: `Dữ liệu 30 ngày của học sinh:\n\n${monthDataToText(data)}\n\nHãy viết nhận xét tổng kết tháng.` }],
    });
    if (response.stop_reason === "refusal") throw new SummaryAiUnavailable("AI từ chối yêu cầu");
    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();
    if (!text) throw new SummaryAiUnavailable("AI không trả về nội dung");
    return text;
  } catch (err) {
    if (err instanceof SummaryAiUnavailable) throw err;
    console.error("[monthly-summary] Lỗi khi gọi Claude:", err);
    throw new SummaryAiUnavailable(err instanceof Anthropic.RateLimitError ? "AI đang quá tải" : "Không gọi được AI");
  }
}

/** Bản nháp theo mẫu (không cần AI) — dựng từ số liệu thật, giáo viên chỉnh lại trước khi gửi. */
export function buildTemplateSummary(d: MonthData): string {
  const { present, late, absent } = d.attendance;
  const total = present + late + absent;
  const rated = d.subjects.flatMap((s) => s.criteria.filter((c) => c.avg !== null).map((c) => ({ ...c, subject: s.name })));
  const strengths = [...rated].sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0)).filter((c) => (c.avg ?? 0) >= 4).slice(0, 3);
  const weaker = [...rated].sort((a, b) => (a.avg ?? 0) - (b.avg ?? 0)).filter((c) => (c.avg ?? 0) < 3.5).slice(0, 2);

  const p1 =
    total > 0
      ? `Kính gửi Ba mẹ, trong 30 ngày qua (${fullDate(d.from)} – ${fullDate(d.to)}), bé ${d.childName} đi học ${present + late}/${total} buổi${
          late ? ` (có ${late} buổi đến muộn)` : ""
        }${absent ? `, nghỉ ${absent} buổi` : ""}. ${
          absent + late === 0 ? "Con đi học rất đều và đúng giờ — cô rất vui về điều này." : "Ba mẹ cố gắng giúp con duy trì việc đi học đều đặn, đúng giờ nhé."
        }`
      : `Kính gửi Ba mẹ, đây là nhận xét tổng kết của bé ${d.childName} trong 30 ngày qua (${fullDate(d.from)} – ${fullDate(d.to)}).`;

  const p2 = strengths.length
    ? `Con thể hiện tốt ở ${strengths.map((s) => `${s.label.toLowerCase()} (${s.subject})`).join(", ")}. Đây là những điểm mạnh cô mong Ba mẹ tiếp tục khen ngợi để con thêm tự tin.`
    : "Con tham gia các hoạt động trên lớp với tinh thần tích cực; cô sẽ tiếp tục theo dõi để ghi nhận những điểm mạnh nổi bật của con.";

  const p3 = weaker.length
    ? `Bên cạnh đó, con cần rèn thêm ${weaker.map((s) => `${s.label.toLowerCase()} (${s.subject})`).join(" và ")}. Với sự đồng hành của Ba mẹ, cô tin con sẽ tiến bộ nhanh.`
    : "Hiện chưa có tiêu chí nào đáng lo ngại; cô sẽ tiếp tục giao bài vừa sức để con phát triển đều các môn.";

  const tips: string[] = [];
  const has = (label: string) => weaker.some((w) => w.label === label);
  if (has("Nhận biết mặt chữ") || has("Ghép vần")) tips.push("cùng con đọc to 5–10 phút mỗi tối, chỉ tay theo từng chữ");
  if (has("Khả năng tập trung")) tips.push("cho con làm một việc trọn vẹn trong 10 phút không có điện thoại, tivi");
  if (has("Độ đều nét") || has("Khoảng cách chữ")) tips.push("cho con tô và viết 3–5 dòng chữ mẫu mỗi ngày");
  if (has("Tư thế ngồi & cầm bút")) tips.push("nhắc con ngồi thẳng lưng, cầm bút đúng khi viết ở nhà");
  if (has("Khả năng tính nhẩm") || has("Tốc độ phản xạ")) tips.push("chơi trò đố tính nhẩm nhanh 5 phút khi đi đường hoặc trước giờ ngủ");
  if (has("Logic hình khối")) tips.push("chơi xếp hình, lego hoặc ghép tangram cùng con cuối tuần");
  if (tips.length === 0) tips.push("dành 10–15 phút mỗi tối trò chuyện, cùng con ôn lại bài trên lớp", "khuyến khích con đọc sách tranh và kể lại cho Ba mẹ nghe");
  const p4 = `Tại nhà, Ba mẹ có thể ${tips.slice(0, 3).join("; ")}. Cảm ơn Ba mẹ đã luôn đồng hành cùng con và trung tâm!`;

  return [p1, p2, p3, p4].join("\n\n");
}
