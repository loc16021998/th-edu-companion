import { isChildId, pickChild } from "@/features/parent/selected-child";

const A = { id: "11111111-1111-4111-8111-111111111111", name: "Khang" };
const B = { id: "22222222-2222-4222-8222-222222222222", name: "An" };
const OTHER_FAMILY = "33333333-3333-4333-8333-333333333333";

describe("Chọn bé đang xem (phụ huynh nhiều con)", () => {
  test("ưu tiên ?child= trên URL (link thông báo của đúng bé)", () => {
    expect(pickChild([A, B], B.id, A.id)).toBe(B);
  });
  test("không có URL → bé đã chọn lần trước (cookie)", () => {
    expect(pickChild([A, B], null, B.id)).toBe(B);
  });
  test("không có gì → bé đầu tiên", () => {
    expect(pickChild([A, B], undefined, undefined)).toBe(A);
  });
  test("id của gia đình khác / sửa tay → bỏ qua, KHÔNG lộ dữ liệu bé khác", () => {
    expect(pickChild([A, B], OTHER_FAMILY, null)).toBe(A);
    expect(pickChild([A, B], null, OTHER_FAMILY)).toBe(A);
    expect(pickChild([A, B], OTHER_FAMILY, B.id)).toBe(B);
  });
  test("cookie rác không phải UUID bị bỏ qua", () => {
    expect(isChildId("x'; drop table students;--")).toBe(false);
    expect(pickChild([A, B], null, "x'; drop table")).toBe(A);
  });
  test("phụ huynh chưa có bé → null", () => {
    expect(pickChild([], B.id, B.id)).toBeNull();
  });
});
