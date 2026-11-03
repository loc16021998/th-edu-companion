import { DRAFT_ARTICLES, ESCALATE_MARKER, bestArticle, knowledgePrompt, needsManager, selectKnowledge, splitEscalation } from "@/features/parent-chat/knowledge-shared";

const kb = [
  { id: "1", title: "Nghỉ học và học bù", category: "quy_che", content: "- Bé nghỉ có phép được học bù trong vòng 2 tuần, lịch bù do giáo viên chủ nhiệm sắp xếp." },
  { id: "2", title: "Đóng học phí", category: "hoc_phi", content: "- Bấm Thanh toán ngay để quét mã QR. Hạn đóng ghi ở từng khoản." },
  { id: "3", title: "Cách cầm bút đúng khi học Luyện chữ đẹp", category: "su_pham", content: "- Cầm bút bằng 3 ngón, bút nghiêng 45 độ, lưng thẳng." },
];

describe("Dấu kết nối Quản lý cơ sở trong câu trả lời", () => {
  test("có dấu → hiện nút, chữ không còn dấu", () => {
    expect(splitEscalation(`Ba mẹ vui lòng bấm nút kết nối nhé.\n${ESCALATE_MARKER}`)).toEqual({ text: "Ba mẹ vui lòng bấm nút kết nối nhé.", escalate: true });
  });
  test("đang stream dở dấu → ẩn phần dở, chưa hiện nút", () => {
    expect(splitEscalation("Ba mẹ bấm nút nhé.\n[KET_NO")).toEqual({ text: "Ba mẹ bấm nút nhé.", escalate: false });
  });
  test("câu trả lời bình thường giữ nguyên (kể cả có ngoặc vuông khác)", () => {
    expect(splitEscalation("Học phí [tháng 11] còn 2.000.000 ₫.")).toEqual({ text: "Học phí [tháng 11] còn 2.000.000 ₫.", escalate: false });
  });
});

describe("Chọn tài liệu đưa vào ngữ cảnh (RAG)", () => {
  test("kho nhỏ → đưa toàn bộ (ổn định, được cache)", () => {
    expect(selectKnowledge(kb, "bất kỳ")).toEqual({ picked: kb, all: true });
  });
  test("kho lớn → chọn bài sát câu hỏi nhất trước", () => {
    const filler = Array.from({ length: 60 }, (_, i) => ({ id: `f${i}`, title: `Sự kiện ${i}`, category: "lich_hoc", content: "Nội dung dài ".repeat(80) }));
    const { picked, all } = selectKnowledge([...filler, ...kb], "Bé nghỉ học có được học bù không?", 3000);
    expect(all).toBe(false);
    expect(picked[0]?.id).toBe("1");
  });
  test("câu hỏi gõ không dấu vẫn tìm đúng bài", () => {
    expect(bestArticle(kb, "be nghi co duoc hoc bu khong")?.id).toBe("1");
    expect(bestArticle(kb, "Cách cầm bút đúng cho bé?")?.id).toBe("3");
  });
  test("không bài nào đủ khớp → null (không trả bài lạc đề)", () => {
    expect(bestArticle(kb, "Thời tiết hôm nay thế nào?")).toBeNull();
    // Chỉ trùng từ chung "học" với bài học bù → không phải cùng chủ đề
    expect(bestArticle(kb, "Tôi muốn khiếu nại vì học phí bị thu sai")?.id).not.toBe("1");
    expect(bestArticle(kb, "Lớp học của con ở đâu?")).toBeNull();
  });
  test("kho rỗng → nhắc trợ lý không đoán quy định", () => {
    expect(knowledgePrompt([])).toMatch(/chưa soạn tài liệu/);
    expect(knowledgePrompt(kb)).toContain("[Quy chế (nghỉ học, học bù…)] Nghỉ học và học bù");
  });
});

describe("Cần người của trung tâm", () => {
  test.each(["Tôi muốn khiếu nại về học phí bị thu sai", "Con bị đánh ở lớp", "Tôi không hài lòng, cần gặp quản lý"])("%s → kết nối Quản lý", (q) => {
    expect(needsManager(q)).toBe(true);
  });
  test("câu hỏi thường → không", () => {
    expect(needsManager("Học phí tháng này đóng đến hạn nào?")).toBe(false);
  });
});

test("bài nháp mẫu hợp lệ với ràng buộc database (tiêu đề 3–150, nội dung 10–8000)", () => {
  for (const d of DRAFT_ARTICLES) {
    expect(d.title.length).toBeGreaterThanOrEqual(3);
    expect(d.title.length).toBeLessThanOrEqual(150);
    expect(d.content.length).toBeLessThanOrEqual(8000);
  }
});
