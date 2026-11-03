/**
 * Kho kiến thức của Trợ lý AI hỏi – đáp (dùng chung client + server, không gọi mạng).
 * Quản trị soạn bài ở /admin/ai-knowledge; trợ lý chỉ dùng bài đang bật.
 */
export const KNOWLEDGE_CATEGORIES = {
  quy_che: "Quy chế (nghỉ học, học bù…)",
  hoc_phi: "Học phí & thanh toán",
  lich_hoc: "Lịch học & sự kiện",
  su_pham: "Đồng hành cùng con (sư phạm)",
  ung_dung: "Dùng ứng dụng",
  khac: "Khác",
} as const;
export type KnowledgeCategory = keyof typeof KNOWLEDGE_CATEGORIES;
export const KNOWLEDGE_CATEGORY_KEYS = Object.keys(KNOWLEDGE_CATEGORIES) as [KnowledgeCategory, ...KnowledgeCategory[]];

export type KnowledgeArticle = { id: string; title: string; category: string; content: string };

/** Trợ lý đặt dòng này cuối câu trả lời khi cần người thật xử lý → giao diện hiện nút "Kết nối Quản lý cơ sở". */
export const ESCALATE_MARKER = "[KET_NOI_QUAN_LY]";

/** Bỏ dấu kết nối khỏi câu trả lời (cả khi đang stream dở: "[KET_NO…"). */
export function splitEscalation(text: string): { text: string; escalate: boolean } {
  const escalate = text.includes(ESCALATE_MARKER);
  let clean = text.split(ESCALATE_MARKER).join("");
  // Đang stream: cuối chuỗi có thể là phần đầu của dấu ("[KET_NO") → ẩn đi, chờ phần còn lại
  for (let k = ESCALATE_MARKER.length - 1; k > 0; k--) {
    if (clean.endsWith(ESCALATE_MARKER.slice(0, k))) {
      clean = clean.slice(0, -k);
      break;
    }
  }
  return { text: clean.trimEnd(), escalate };
}

/** Bỏ dấu tiếng Việt + chữ thường để so khớp từ khoá ("Học bù" ~ "hoc bu"). */
export function normalizeVi(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Từ quá chung (kể cả từ chung của lĩnh vực: "học", "lớp", "trung tâm") — trùng 1 từ này không có nghĩa là cùng chủ đề
const STOP = new Set([
  "la", "va", "co", "cho", "cua", "toi", "con", "be", "em", "anh", "chi", "khong", "thi", "nao", "gi", "the", "duoc", "o", "a", "nhe", "voi", "mot", "nhu", "nay",
  "hoc", "lop", "trung", "tam", "muon", "vi", "bi", "ba", "me", "can", "lam", "sao",
]);

/** Từ khoá có nghĩa (cả cặp 2 từ — tiếng Việt nhiều từ ghép: "hoc bu", "hoc phi"). */
function terms(text: string): Set<string> {
  const words = normalizeVi(text).split(" ").filter(Boolean);
  const out = new Set<string>();
  words.forEach((w, i) => {
    if (!STOP.has(w) && w.length > 1) out.add(w);
    if (i > 0) out.add(`${words[i - 1]} ${w}`);
  });
  return out;
}

/**
 * Chọn bài đưa vào ngữ cảnh. Kho nhỏ (≤ ngân sách) → đưa TẤT CẢ (ổn định → được cache, không sót bài liên quan).
 * Kho lớn → xếp hạng theo độ trùng từ khoá với câu hỏi gần đây (tiêu đề nặng gấp 3), lấy đến hết ngân sách.
 */
export function selectKnowledge(articles: KnowledgeArticle[], query: string, budgetChars = 40_000): { picked: KnowledgeArticle[]; all: boolean } {
  const size = (a: KnowledgeArticle) => a.title.length + a.content.length + 40;
  const total = articles.reduce((n, a) => n + size(a), 0);
  if (total <= budgetChars) return { picked: articles, all: true };

  const q = terms(query);
  const scored = articles
    .map((a, i) => {
      const t = terms(a.title);
      const c = terms(a.content);
      let score = 0;
      for (const term of q) score += (t.has(term) ? 3 : 0) + (c.has(term) ? 1 : 0) + (term.includes(" ") && (t.has(term) || c.has(term)) ? 2 : 0);
      return { a, i, score };
    })
    .sort((x, y) => y.score - x.score || x.i - y.i);

  const picked: KnowledgeArticle[] = [];
  let used = 0;
  for (const { a } of scored) {
    if (used + size(a) > budgetChars) continue;
    picked.push(a);
    used += size(a);
  }
  return { picked, all: false };
}

/** Bài sát câu hỏi nhất (dùng khi chưa có AI). Không bài nào đủ khớp → null. */
export function bestArticle(articles: KnowledgeArticle[], question: string): KnowledgeArticle | null {
  const q = [...terms(question)];
  let best: { a: KnowledgeArticle; score: number } | null = null;
  for (const a of articles) {
    const t = terms(a.title);
    const c = terms(a.content);
    const score = q.reduce((n, term) => n + (t.has(term) ? 3 : 0) + (c.has(term) ? 1 : 0) + (term.includes(" ") && (t.has(term) || c.has(term)) ? 2 : 0), 0);
    if (score > (best?.score ?? 0)) best = { a, score };
  }
  // Cần trùng ít nhất 1 cụm 2 từ hoặc vài từ đơn — tránh trả bài lạc đề vì 1 từ chung chung
  return best && best.score >= 4 ? best.a : null;
}

/** Khiếu nại / tranh chấp / sự cố — cần người của trung tâm (dùng khi chưa có AI). */
export function needsManager(question: string): boolean {
  const q = ` ${normalizeVi(question)} `;
  return [" khieu nai ", " tranh chap ", " buc xuc ", " hoan tien ", " tru sai ", " thu sai ", " tinh sai ", " sai hoc phi ", " bi danh ", " tai nan ", " bi thuong ", " khong hai long ", " gap quan ly ", " gap ban quan ly "].some((k) =>
    q.includes(k),
  );
}

export function knowledgePrompt(articles: KnowledgeArticle[]): string {
  if (articles.length === 0) {
    return "# Tài liệu của trung tâm\n(Trung tâm chưa soạn tài liệu nào. Câu hỏi về quy chế / quy định → nói chưa có thông tin chính thức và đề nghị kết nối Quản lý cơ sở.)";
  }
  const body = articles
    .map((a) => `## [${KNOWLEDGE_CATEGORIES[a.category as KnowledgeCategory] ?? "Khác"}] ${a.title}\n${a.content.trim()}`)
    .join("\n\n");
  return `# Tài liệu chính thức của trung tâm (do Ban quản lý soạn — nguồn ưu tiên cao nhất)\n${body}`;
}

/**
 * Bài NHÁP gợi ý cho quản trị (thêm vào kho ở trạng thái TẮT — duyệt, sửa cho đúng thực tế rồi mới bật).
 * Phần [trong ngoặc vuông] là chỗ trung tâm tự điền theo quy định thật.
 */
export const DRAFT_ARTICLES: { title: string; category: KnowledgeCategory; content: string }[] = [
  {
    title: "Nghỉ học và học bù",
    category: "quy_che",
    content:
      "- Xin nghỉ: phụ huynh gửi đơn ở mục \"Xin nghỉ học\" trong ứng dụng trước [giờ] ngày học.\n- Học bù: bé nghỉ có phép được [học bù / không học bù] trong vòng [số ngày] kể từ buổi nghỉ, lịch bù do [giáo viên chủ nhiệm / văn phòng cơ sở] sắp xếp.\n- Nghỉ không phép: [quy định của trung tâm].\n- Học phí buổi nghỉ: [được trừ / bảo lưu / không hoàn] theo quy định [ghi rõ].",
  },
  {
    title: "Đóng học phí",
    category: "hoc_phi",
    content:
      "- Học phí thông báo trong mục \"Học phí\" của ứng dụng, mỗi khoản có hạn đóng riêng.\n- Cách đóng: bấm \"Thanh toán ngay\" để quét mã QR (đã điền sẵn số tiền và nội dung chuyển khoản), hoặc đóng trực tiếp tại văn phòng cơ sở.\n- Trạng thái chuyển sang \"Đã thanh toán\" khi trung tâm xác nhận tiền về (thường trong ngày làm việc).\n- Quá hạn: [quy định nhắc / phụ thu nếu có].",
  },
  {
    title: "Cách cầm bút đúng khi học Luyện chữ đẹp",
    category: "su_pham",
    content:
      "- Cầm bút bằng 3 ngón: ngón cái và ngón trỏ giữ hai bên thân bút, ngón giữa đỡ bên dưới; các ngón còn lại co nhẹ.\n- Đầu ngón tay cách ngòi bút khoảng 2–2,5 cm; bút nghiêng khoảng 45° so với mặt giấy, đầu bút hướng về vai phải.\n- Tư thế: lưng thẳng, mắt cách vở 25–30 cm, hai chân đặt chạm sàn, tay trái giữ vở.\n- Ở nhà: cho con tô 3–5 dòng nét cơ bản mỗi ngày, mỗi lần 10–15 phút; khen khi con ngồi và cầm bút đúng, nhắc nhẹ khi sai — tránh viết quá lâu làm con mỏi tay.\n[Trung tâm bổ sung phương pháp riêng của TH EDU nếu có.]",
  },
  {
    title: "Đồng hành cùng con học Toán tư duy tại nhà",
    category: "su_pham",
    content:
      "- Học qua đồ vật: đếm, so sánh nhiều – ít, xếp theo quy luật với hạt, cúc áo, đồ chơi.\n- Trò chơi 5–10 phút mỗi ngày: đố tính nhẩm nhanh khi đi đường, tìm hình còn thiếu, xếp tangram / lego theo mẫu.\n- Hỏi \"Vì sao con nghĩ vậy?\" để con tập giải thích cách làm, thay vì chỉ hỏi đáp án.\n- Khen nỗ lực và cách suy nghĩ, không so sánh với bạn; con làm sai thì gợi ý nhỏ để con tự tìm ra.\n[Trung tâm bổ sung giáo trình / bài tập về nhà của TH EDU nếu có.]",
  },
  {
    title: "Chuẩn bị Tiền tiểu học tại nhà",
    category: "su_pham",
    content:
      "- Đọc sách tranh cùng con 10–15 phút mỗi tối, chỉ tay theo từng chữ; khuyến khích con kể lại câu chuyện.\n- Ôn chữ cái và ghép vần nhẹ nhàng qua trò chơi (tìm chữ trên bao bì, biển hiệu).\n- Tập thói quen: tự soạn cặp, ngồi học đúng giờ, tập trung trọn vẹn 15–20 phút không điện thoại, tivi.\n- Trao đổi với giáo viên qua Sổ liên lạc để biết con đang học đến đâu và cần luyện thêm gì.",
  },
];
