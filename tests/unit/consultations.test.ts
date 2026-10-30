import { bookingIcs, groupSlotsByDay, minutesOf, overlapsExisting, slotCount, slotLabel, startsIn, vnDate, vnTime } from "@/features/consultations/time";
import { adminScheduleSchema, availabilitySchema, bookSchema } from "@/features/consultations/schema";

describe("Giờ Việt Nam", () => {
  test("đổi UTC sang ngày / giờ VN (+7)", () => {
    expect(vnDate("2026-10-31T17:30:00Z")).toBe("2026-11-01");
    expect(vnTime("2026-10-31T09:00:00+00:00")).toBe("16:00");
    expect(slotLabel("2026-10-31T09:00:00Z", "2026-10-31T09:30:00Z")).toBe("T7 31/10 · 16:00–16:30");
  });
  test("đếm ngược tới giờ hẹn", () => {
    const now = Date.parse("2026-10-31T08:35:00Z");
    expect(startsIn("2026-10-31T09:00:00Z", now)).toBe("còn 25 phút");
    expect(startsIn("2026-10-31T10:40:00Z", now)).toBe("còn 2 giờ 5 phút");
    expect(startsIn("2026-10-31T08:00:00Z", now)).toBeNull();
  });
});

describe("Khung giờ rảnh", () => {
  test("chia ô: 16:00–17:30 × 30 phút = 3 ô; lẻ thì bỏ phần thừa", () => {
    expect(slotCount("16:00", "17:30", 30)).toBe(3);
    expect(slotCount("16:00", "17:10", 30)).toBe(2);
    expect(slotCount("17:00", "16:00", 30)).toBe(0);
    expect(minutesOf("25:00")).toBeNaN();
  });
  test("phát hiện khung trùng cùng thứ, bỏ qua chính nó khi sửa", () => {
    const existing = [{ id: "a", weekday: 6, start: "16:00", end: "17:30" }];
    expect(overlapsExisting({ weekday: 6, start: "17:00", end: "18:00" }, existing)?.id).toBe("a");
    expect(overlapsExisting({ weekday: 6, start: "17:30", end: "18:00" }, existing)).toBeNull(); // nối tiếp, không trùng
    expect(overlapsExisting({ weekday: 5, start: "16:00", end: "17:00" }, existing)).toBeNull();
    expect(overlapsExisting({ id: "a", weekday: 6, start: "16:00", end: "18:00" }, existing)).toBeNull();
  });
  test("schema: giờ kết thúc phải sau giờ bắt đầu ≥ 1 ô; link họp phải https", () => {
    const base = { weekday: 6, start: "16:00", end: "17:30", slotMinutes: 30, mode: "online" as const };
    expect(availabilitySchema.safeParse(base).success).toBe(true);
    expect(availabilitySchema.safeParse({ ...base, end: "16:20" }).success).toBe(false);
    expect(availabilitySchema.safeParse({ ...base, slotMinutes: 25 }).success).toBe(false);
    expect(availabilitySchema.safeParse({ ...base, meetingUrl: "http://zoom.us/x" }).success).toBe(false);
    expect(availabilitySchema.parse({ ...base, meetingUrl: "" }).meetingUrl).toBeNull();
    expect(availabilitySchema.parse(base).audience).toBe("parents");
    expect(availabilitySchema.safeParse({ ...base, audience: "everyone" }).success).toBe(false);
  });
});

describe("Đặt lịch", () => {
  test("nhóm ô theo ngày VN và đếm ô trống", () => {
    const days = groupSlotsByDay([
      { startsAt: "2026-10-31T09:30:00Z", endsAt: "2026-10-31T10:00:00Z", mode: "online", available: false },
      { startsAt: "2026-10-31T09:00:00Z", endsAt: "2026-10-31T09:30:00Z", mode: "online", available: true },
      { startsAt: "2026-11-07T09:00:00Z", endsAt: "2026-11-07T09:30:00Z", mode: "online", available: true },
    ]);
    expect(days.map((d) => [d.date, d.free, d.slots.length])).toEqual([
      ["2026-10-31", 1, 2],
      ["2026-11-07", 1, 1],
    ]);
    expect(vnTime(days[0]!.slots[0]!.startsAt)).toBe("16:00");
  });
  test("nội dung trao đổi tối thiểu 5 ký tự", () => {
    const v = { studentId: "11111111-1111-4111-8111-111111111111", hostId: "22222222-2222-4222-8222-222222222222", startsAt: "2026-10-31T09:00:00+00:00" };
    expect(bookSchema.safeParse({ ...v, topic: "Hi" }).success).toBe(false);
    expect(bookSchema.safeParse({ ...v, topic: "Muốn trao đổi về phương pháp rèn chữ" }).success).toBe(true);
    // Giáo viên đặt với Ban quản lý: không kèm bé
    expect(bookSchema.safeParse({ ...v, studentId: null, topic: "Xin ý kiến về giáo án" }).success).toBe(true);
  });
  test("quản trị viên lên lịch: thời lượng trong danh sách, link https, khung giờ VN", () => {
    const base = {
      hostId: "22222222-2222-4222-8222-222222222222",
      guestId: "33333333-3333-4333-8333-333333333333",
      studentId: null,
      date: "2026-11-02",
      time: "16:00",
      minutes: 30,
      mode: "online" as const,
      topic: "Đánh giá giữa kỳ",
    };
    expect(adminScheduleSchema.safeParse(base).success).toBe(true);
    expect(adminScheduleSchema.safeParse({ ...base, minutes: 25 }).success).toBe(false);
    expect(adminScheduleSchema.safeParse({ ...base, meetingUrl: "zoom.us/abc" }).success).toBe(false);
    expect(adminScheduleSchema.safeParse({ ...base, date: "02/11/2026" }).success).toBe(false);
    expect(new Date(`${base.date}T${base.time}:00+07:00`).toISOString()).toBe("2026-11-02T09:00:00.000Z");
  });
  test("file .ics có giờ UTC + nhắc trước 30 phút + thoát ký tự đặc biệt", () => {
    const ics = bookingIcs({ id: "x", startsAt: "2026-10-31T09:00:00Z", endsAt: "2026-10-31T09:30:00Z", title: "Hẹn cô; lớp T2B", description: "a,b" });
    expect(ics).toContain("DTSTART:20261031T090000Z");
    expect(ics).toContain("TRIGGER:-PT30M");
    expect(ics).toContain("SUMMARY:Hẹn cô\\; lớp T2B");
    expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
  });
});
