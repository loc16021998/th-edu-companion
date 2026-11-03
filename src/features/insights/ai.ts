import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Signal } from "./risk";

const MODEL = "claude-opus-5-5";

/** Gửi qua Nhắn tin: 1 tin tối đa 2000 ký tự → bản 360° giữ dưới mức này để phụ huynh đọc liền mạch. */
export const MAX_360 = 1900;

export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function ask(system: string, prompt: string, effort: "low" | "medium"): Promise<string | null> {
  const client = new Anthropic({ timeout: 60_000, maxRetries: 1 });
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 6000,
      output_config: { effort },
      // Bộ phân loại an toàn có thể từ chối nhầm → tự chạy lại trên model dự phòng Anthropic khuyến nghị
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") return null;
    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();
    return text || null;
  } catch (err) {
    console.error("[insights] Lỗi khi gọi Claude:", err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : err);
    return null;
  }
}

const signalLines = (signals: Signal[]) => signals.map((s) => `- [${s.severity === "high" ? "cao" : s.severity === "medium" ? "trung bình" : "theo dõi"}] ${s.title}: ${s.detail}`).join("\n");

const INTERVENTION_SYSTEM = `Bạn là chuyên gia sư phạm tại Hệ thống giáo dục TH EDU (Tiền tiểu học, Luyện chữ đẹp, Toán tư duy cho trẻ 4–7 tuổi, lớp buổi tối 18:00–19:30).
Nhiệm vụ: dựa trên các dấu hiệu cảnh báo và dữ liệu 30 ngày của một bé, đề xuất GỢI Ý CAN THIỆP SƯ PHẠM cho cô giáo.

Yêu cầu:
- Tiếng Việt, gọi cô giáo là "cô", gọi bé là "bé <tên>". Văn phong chuyên môn, ngắn gọn, tích cực — không phán xét bé hay gia đình.
- 2–4 gạch đầu dòng "- ", mỗi dòng 1 việc CỤ THỂ cô làm được ngay trên lớp hoặc khi trao đổi với phụ huynh (vd. chỗ ngồi, hoạt động khởi động 5 phút, chia nhỏ nhiệm vụ, cách khen, nội dung cần trao đổi với gia đình). Ưu tiên dấu hiệu nặng nhất.
- Nêu rõ môn / kỹ năng liên quan khi có. CHỈ dựa trên dữ liệu được cung cấp, không bịa thêm sự việc.
- Không chẩn đoán y tế / tâm lý; dấu hiệu sức khoẻ đáng lo → gợi ý trao đổi với phụ huynh.
- Chỉ văn bản thuần, không tiêu đề, không markdown khác ngoài "- ".`;

/** Gợi ý can thiệp cho cô giáo (null → bên gọi dùng gợi ý theo quy tắc). */
export async function aiIntervention(childName: string, signals: Signal[], dataText: string): Promise<string | null> {
  const text = await ask(INTERVENTION_SYSTEM, `Bé: ${childName}\n\nDấu hiệu cảnh báo:\n${signalLines(signals) || "- (không có)"}\n\nDữ liệu 30 ngày:\n${dataText}`, "low");
  return text ? text.slice(0, 1500) : null;
}

const REPORT_SYSTEM = `Bạn là giáo viên chủ nhiệm tại Hệ thống giáo dục TH EDU, viết bản "Nhận xét chiều sâu 360°" gửi riêng phụ huynh (dùng cho buổi họp phụ huynh hoặc nhắn riêng).

Yêu cầu:
- Tiếng Việt, xưng "cô", gọi phụ huynh là "Ba mẹ", gọi học sinh là "con" hoặc "bé <tên>". Ấm áp, chân thành, cụ thể, mang tính xây dựng.
- Bố cục đúng 4 phần, mỗi phần mở đầu bằng nhãn sau (giữ nguyên nhãn và emoji), mỗi phần 2–4 câu hoặc 2–4 gạch đầu dòng "- ":
  🌟 Điểm mạnh của con:
  🌱 Điều con cần cải thiện:
  📅 Chuyên cần & bài tập về nhà:
  🏡 Ba mẹ đồng hành cùng con tại nhà:
- Khen cụ thể trước (theo môn / tiêu chí điểm cao, nhận xét tốt). Điểm cần cải thiện: tế nhị, nêu rõ kỹ năng, kèm cách cô đang hỗ trợ trên lớp.
- Phần cuối: 2–3 hoạt động 5–15 phút/ngày Ba mẹ làm cùng con, sát điểm cần cải thiện; kết bằng 1 câu động viên.
- CHỈ dựa vào dữ liệu được cung cấp; không bịa sự việc, con số. Thiếu dữ liệu ở mục nào thì nói nhẹ nhàng là cô sẽ theo dõi thêm.
- Không nhắc tới "AI", "hệ thống cảnh báo", "điểm rủi ro". Không markdown ngoài "- ". Tổng độ dài DƯỚI 1500 ký tự.`;

/** Bản "Nhận xét chiều sâu 360°" (null → bên gọi dùng bản theo mẫu). */
export async function aiReport360(childName: string, signals: Signal[], dataText: string, homeworkText: string): Promise<string | null> {
  const text = await ask(
    REPORT_SYSTEM,
    `Học sinh: bé ${childName}\n\n${dataText}\n\nBài tập về nhà: ${homeworkText}\n\nĐiểm cô đang theo dõi thêm (dùng để viết phần cần cải thiện, KHÔNG nhắc là "cảnh báo"):\n${signalLines(signals) || "- (không có)"}\n\nHãy viết bản nhận xét.`,
    "medium",
  );
  return text ? text.slice(0, MAX_360) : null;
}
