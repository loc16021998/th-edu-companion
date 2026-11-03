import { IDEA_KIND_KEYS, seasonForMonth, splitPoints, templateDrafts, templateIdeas } from "@/features/center/ai-content-shared";

describe("Ý chính → thông báo", () => {
  test("tách ý: gạch đầu dòng, dòng mới, dấu phẩy / chấm phẩy", () => {
    expect(splitPoints("Thông báo nghỉ lễ 30/4, lịch học bù vào Chủ Nhật; chúc các gia đình kỳ nghỉ vui vẻ")).toEqual([
      "Thông báo nghỉ lễ 30/4",
      "lịch học bù vào Chủ Nhật",
      "chúc các gia đình kỳ nghỉ vui vẻ",
    ]);
    expect(splitPoints("- Nghỉ lễ\n• Học bù Chủ nhật\n\n")).toEqual(["Nghỉ lễ", "Học bù Chủ nhật"]);
  });

  test("bản theo mẫu: đủ 3 văn phong, giữ đủ mọi ý chính", () => {
    const points = ["nghỉ lễ 30/4 – 1/5", "học bù vào Chủ nhật 4/5"];
    const drafts = templateDrafts(points, "Lịch nghỉ lễ");
    expect(drafts.map((d) => d.style)).toEqual(["warm", "formal", "social"]);
    for (const d of drafts) {
      expect(d.body).toContain("Nghỉ lễ 30/4 – 1/5");
      expect(d.body).toContain("Học bù vào Chủ nhật 4/5");
    }
    expect(drafts[2]!.body).toMatch(/#THEDU/); // bản đăng Zalo / Facebook có hashtag
    expect(drafts[1]!.body).not.toMatch(/\p{Extended_Pictographic}/u); // bản trang trọng không emoji
  });
});

describe("Ý tưởng sự kiện & tuyển sinh", () => {
  test("dịp gợi ý theo tháng hiện tại", () => {
    expect(seasonForMonth(11)).toBe("ngay_20_11");
    expect(seasonForMonth(9)).toBe("khai_giang");
    expect(seasonForMonth(1)).toBe("tet");
  });
  test("ý tưởng mẫu đủ phần, số liệu để [..] cho quản trị tự điền (không bịa)", () => {
    for (const kind of IDEA_KIND_KEYS) {
      const [idea] = templateIdeas("he", "toan_tu_duy", kind);
      expect(idea?.plan.length).toBeGreaterThanOrEqual(3);
      expect(idea?.talkingPoints.length).toBeGreaterThanOrEqual(3);
      expect(idea?.announcementPoints).toBeTruthy();
      expect(`${idea?.offer} ${idea?.announcementPoints}`).not.toMatch(/\d+\s*%/);
    }
  });
});
