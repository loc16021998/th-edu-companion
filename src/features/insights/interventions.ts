/**
 * Gợi ý can thiệp sư phạm theo quy tắc (dùng khi chưa bật AI / AI lỗi) — mỗi cảnh báo → 1 việc cụ thể cô làm được ngay.
 * Module thuần.
 */
import type { SubjectKey } from "@/config/constants";
import type { Signal } from "./risk";

const CRITERION_TIPS: Record<string, string> = {
  tap_trung: "cho bé ngồi bàn đầu, chia bài thành bước ngắn 5–7 phút và khen ngay khi bé hoàn thành từng bước",
  nhan_biet_mat_chu: "ôn 3–5 chữ cái mỗi buổi bằng thẻ chữ có tranh, cho bé tìm chữ trong sách truyện",
  ghep_van: "luyện ghép vần bằng trò chơi ghép thẻ âm – vần, bắt đầu từ vần đơn quen thuộc",
  deu_net: "cho bé tô lại nét cơ bản trên vở ô li 3–5 dòng, nhắc viết chậm, đều tay",
  khoang_cach: "dùng ngón tay trỏ làm \"thước\" đặt giữa hai chữ để bé canh khoảng cách",
  tu_the: "chỉnh tư thế ngồi thẳng lưng, cầm bút 3 ngón ngay đầu giờ và nhắc lại giữa buổi",
  tinh_nham: "dành 5 phút đầu giờ chơi đố tính nhẩm nhanh với que tính / ngón tay",
  logic_hinh_khoi: "cho bé xếp tangram / khối gỗ theo mẫu từ dễ đến khó",
  toc_do_phan_xa: "chơi trò \"ai nhanh hơn\" với thẻ số 3–5 phút, tăng dần độ khó",
};

const SUBJECT_TIPS: Record<SubjectKey, string> = {
  tien_tieu_hoc: "đọc to cùng bé 5 phút đầu giờ và cho bé kể lại câu chuyện ngắn",
  luyen_chu: "giảm lượng chữ, ưu tiên viết đúng nét và đúng tư thế hơn viết nhiều",
  toan_tu_duy: "bổ sung trò chơi đếm nhẩm 5 phút đầu giờ và giao bài vừa sức để bé lấy lại tự tin",
};

/** Gợi ý theo từng cảnh báo (tối đa 3 dòng, cảnh báo nặng trước). */
export function ruleInterventions(childName: string, signals: Signal[]): string[] {
  const tips: string[] = [];
  for (const s of signals) {
    switch (s.kind) {
      case "absence_streak":
      case "absence_total":
        tips.push(`Gọi điện hỏi thăm gia đình bé ${childName} về lý do nghỉ; khi bé đi học lại, dành 10 phút ôn phần bị lỡ và sắp xếp buổi học bù nếu cần.`);
        break;
      case "rating_drop":
      case "low_rating":
        tips.push(
          `${s.title}: cô nên ${s.criterion && CRITERION_TIPS[s.criterion] ? CRITERION_TIPS[s.criterion] : s.subject ? SUBJECT_TIPS[s.subject] : "kèm riêng bé vài phút mỗi buổi"}.`,
        );
        break;
      case "low_focus":
        tips.push(`Bé ${childName} hay mất tập trung: ${CRITERION_TIPS.tap_trung}; giao bé một "nhiệm vụ nhỏ" (phát vở, lau bảng) để bé thấy mình được tin tưởng.`);
        break;
      case "tired":
        tips.push(`Bé ${childName} thường mệt: trao đổi với phụ huynh về giờ ngủ, ăn tối trước giờ học; xen 1–2 phút vận động nhẹ giữa buổi.`);
        break;
      case "homework":
        tips.push(`Nhắc phụ huynh bé ${childName} về bài tập chưa nộp; giao bài ngắn hơn (5–10 phút) và khen khi bé nộp đúng hạn.`);
        break;
    }
  }
  return [...new Set(tips)].slice(0, 3);
}
