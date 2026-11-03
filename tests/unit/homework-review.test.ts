import { isAnalyzableImage, mediaKey, starsFromScores, templatePraise } from "@/features/homework/review-shared";

describe("Lời khen cho bé (bản theo mẫu)", () => {
  test("có tên bé + sticker; cố định theo bài nộp (mở lại trang không đổi câu)", () => {
    const a = templatePraise("An", "sub-1|x.jpg");
    expect(a).toContain("An");
    expect(a).toMatch(/\p{Extended_Pictographic}/u);
    expect(templatePraise("An", "sub-1|x.jpg")).toBe(a);
  });
  test("không nhắc lỗi / chê", () => {
    for (let i = 0; i < 20; i++) expect(templatePraise("Bảo", `seed-${i}`)).not.toMatch(/sai|lỗi|chưa đúng|cần sửa/i);
  });
});

describe("Ảnh gửi AI", () => {
  test("chỉ ảnh AI đọc được (bỏ video, HEIC)", () => {
    expect(["a.jpg", "b.JPEG", "c.png", "d.webp", "e.heic", "f.mp4"].filter(isAnalyzableImage)).toEqual(["a.jpg", "b.JPEG", "c.png", "d.webp"]);
  });
  test("khoá ảnh không phụ thuộc thứ tự (đổi ảnh → phân tích lại)", () => {
    expect(mediaKey(["b.jpg", "a.jpg"])).toBe(mediaKey(["a.jpg", "b.jpg"]));
    expect(mediaKey(["a.jpg"])).not.toBe(mediaKey(["a.jpg", "c.jpg"]));
  });
});

test("số sao gợi ý từ điểm tiêu chí (luôn ít nhất 1 sao để khích lệ)", () => {
  expect(starsFromScores([5, 4, 5])).toBe(3);
  expect(starsFromScores([4, 3, 3])).toBe(2);
  expect(starsFromScores([1, 2])).toBe(1);
  expect(starsFromScores([])).toBeNull();
});
