import { collectBadges, milestoneProgress, nextStarValue, pendingRewards, type Milestone } from "@/features/achievements/milestones";
import { badgeSchema, setStarsSchema } from "@/features/achievements/schema";

const m = (id: string, starsRequired: number): Milestone => ({ id, starsRequired, title: `Quà ${starsRequired}`, emoji: "🎁", description: null });
const MILESTONES = [m("c", 80), m("a", 15), m("b", 40)];

describe("Tiến độ tới mốc quà", () => {
  test("chưa có sao → 0% tới mốc đầu tiên", () => {
    const p = milestoneProgress(0, MILESTONES);
    expect(p.next?.starsRequired).toBe(15);
    expect(p.remaining).toBe(15);
    expect(p.percent).toBe(0);
    expect(p.reached).toHaveLength(0);
  });
  test("tính phần trăm trong đoạn giữa 2 mốc (không tính từ 0)", () => {
    const p = milestoneProgress(25, MILESTONES); // 15 → 40: đi được 10/25
    expect(p.from).toBe(15);
    expect(p.next?.id).toBe("b");
    expect(p.remaining).toBe(15);
    expect(p.percent).toBe(40);
  });
  test("đúng bằng số sao của mốc → đã đạt mốc đó", () => {
    const p = milestoneProgress(40, MILESTONES);
    expect(p.reached.map((x) => x.id)).toEqual(["a", "b"]);
    expect(p.next?.id).toBe("c");
  });
  test("vượt mọi mốc → 100%, không còn mốc kế tiếp", () => {
    const p = milestoneProgress(500, MILESTONES);
    expect(p.next).toBeNull();
    expect(p.percent).toBe(100);
    expect(p.remaining).toBe(0);
  });
  test("chưa cấu hình mốc nào", () => {
    expect(milestoneProgress(12, []).next).toBeNull();
  });
});

describe("Quà cần trao", () => {
  test("chỉ mốc đã đủ sao mà cô chưa trao", () => {
    expect(pendingRewards(45, MILESTONES, new Set(["a"])).map((x) => x.id)).toEqual(["b"]);
    expect(pendingRewards(10, MILESTONES, new Set())).toEqual([]);
  });
});

describe("Bộ sưu tập huy hiệu", () => {
  test("đếm số lần nhận + ngày gần nhất", () => {
    const out = collectBadges([
      { badgeId: "x", date: "2026-10-03" },
      { badgeId: "y", date: "2026-10-05" },
      { badgeId: "x", date: "2026-10-12" },
    ]);
    expect(out.get("x")).toEqual({ count: 2, lastDate: "2026-10-12" });
    expect(out.get("y")).toEqual({ count: 1, lastDate: "2026-10-05" });
  });
});

describe("Chạm sao", () => {
  test("chạm số khác → đặt số đó; chạm lại đúng số đang chọn → bỏ sao", () => {
    expect(nextStarValue(0, 2)).toBe(2);
    expect(nextStarValue(2, 3)).toBe(3);
    expect(nextStarValue(3, 3)).toBe(0);
  });
  test("schema chặn sao ngoài 0–3 và ngày tương lai", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(setStarsSchema.safeParse({ studentId: id, date: "2026-10-01", stars: 4 }).success).toBe(false);
    expect(setStarsSchema.safeParse({ studentId: id, date: "2999-01-01", stars: 1 }).success).toBe(false);
    expect(setStarsSchema.safeParse({ studentId: id, date: "2026-10-01", stars: 0 }).success).toBe(true);
  });
  test("huy hiệu: tên quá ngắn / màu lạ bị từ chối, mô tả rỗng → null", () => {
    expect(badgeSchema.safeParse({ name: "A", emoji: "🏅", tone: "amber", active: true }).success).toBe(false);
    expect(badgeSchema.safeParse({ name: "Cây bút vàng", emoji: "✍️", tone: "black", active: true }).success).toBe(false);
    const ok = badgeSchema.parse({ name: "Cây bút vàng", emoji: "✍️", description: "  ", tone: "amber", active: true });
    expect(ok.description).toBeNull();
  });
});
