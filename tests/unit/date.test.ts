import { addDays, addMonths, ageFrom, dayMonth, eachDay, endOfMonth, fullDate, isISODate, relativeDayLabel, startOfWeek, todayVN, weekdayLong, weekdayShort } from "@/lib/date";
import { isSchoolDay, latestSchoolDay, nextSessionDate, sessionPhase } from "@/lib/schedule";

// 28/10/2026 là Thứ Tư; 25/10 và 01/11 là Chủ nhật.

describe("Phép tính ngày (YYYY-MM-DD, không lệch múi giờ)", () => {
  test("cộng / trừ ngày qua tháng, qua năm, năm nhuận", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  test("ngày cuối tháng & sang tháng", () => {
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01"); // luôn về ngày 1 — không tràn sang tháng 3
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-01");
  });

  test("đầu tuần là Thứ Hai (cả khi đang là Chủ nhật)", () => {
    expect(startOfWeek("2026-10-28")).toBe("2026-10-26");
    expect(startOfWeek("2026-11-01")).toBe("2026-10-26");
  });

  test("liệt kê các ngày trong khoảng", () => {
    expect(eachDay("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(eachDay("2026-11-02", "2026-11-01")).toEqual([]);
  });

  test("chỉ nhận ngày có thật", () => {
    expect(isISODate("2026-10-28")).toBe(true);
    expect(isISODate("2026-02-30")).toBe(false);
    expect(isISODate("2026-2-3")).toBe(false);
    expect(isISODate(20261028)).toBe(false);
  });

  test("tuổi: chưa tới sinh nhật thì chưa tăng tuổi", () => {
    expect(ageFrom("2020-10-29", "2026-10-28")).toBe(5);
    expect(ageFrom("2020-10-28", "2026-10-28")).toBe(6);
  });
});

describe("Định dạng ngày tiếng Việt", () => {
  test("thứ trong tuần", () => {
    expect(weekdayLong("2026-10-28")).toBe("Thứ Tư");
    expect(weekdayShort("2026-11-01")).toBe("CN");
  });

  test("ngày/tháng", () => {
    expect(dayMonth("2026-10-28")).toBe("28/10");
    expect(fullDate("2026-01-05")).toBe("05/01/2026");
  });

  test("Hôm nay / Hôm qua / thứ + ngày", () => {
    expect(relativeDayLabel("2026-10-28", "2026-10-28")).toBe("Hôm nay");
    expect(relativeDayLabel("2026-10-27", "2026-10-28")).toBe("Hôm qua");
    expect(relativeDayLabel("2026-10-26", "2026-10-28")).toBe("Thứ Hai, 26/10");
  });
});

describe("Giờ Việt Nam & lịch học", () => {
  afterEach(() => jest.useRealTimers());

  test("hôm nay tính theo giờ Việt Nam (UTC+7), không theo giờ máy chủ", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-27T16:59:00Z")); // 23:59 ngày 27 giờ VN
    expect(todayVN()).toBe("2026-10-27");
    jest.setSystemTime(new Date("2026-10-27T17:00:00Z")); // 00:00 ngày 28 giờ VN
    expect(todayVN()).toBe("2026-10-28");
  });

  test("Chủ nhật nghỉ; ngày học gần nhất của Chủ nhật là Thứ Bảy", () => {
    expect(isSchoolDay("2026-11-01")).toBe(false);
    expect(isSchoolDay("2026-10-31")).toBe(true);
    expect(latestSchoolDay("2026-11-01")).toBe("2026-10-31");
    expect(latestSchoolDay("2026-10-28")).toBe("2026-10-28");
  });

  test("trạng thái buổi học 18:00 – 19:30", () => {
    expect(sessionPhase("2026-10-28", new Date("2026-10-28T10:59:00Z"))).toBe("upcoming"); // 17:59
    expect(sessionPhase("2026-10-28", new Date("2026-10-28T11:00:00Z"))).toBe("in_progress"); // 18:00
    expect(sessionPhase("2026-10-28", new Date("2026-10-28T12:30:00Z"))).toBe("finished"); // 19:30
    expect(sessionPhase("2026-11-01", new Date("2026-11-01T11:00:00Z"))).toBe("off");
  });

  test("buổi học kế tiếp bỏ qua Chủ nhật", () => {
    expect(nextSessionDate("2026-10-31", new Date("2026-10-31T13:00:00Z"))).toBe("2026-11-02"); // T7 đã học xong → T2
    expect(nextSessionDate("2026-10-28", new Date("2026-10-28T09:00:00Z"))).toBe("2026-10-28");
  });
});
