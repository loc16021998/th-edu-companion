import {
  DEFAULT_CAMPUSES,
  appleDirectionsUrl,
  distanceKm,
  formatDistance,
  googleDirectionsUrl,
  parseGoogleMapsCoords,
  rankByDistance,
  telHref,
} from "@/config/campuses";

describe("Đọc toạ độ từ link Google Maps", () => {
  test("ưu tiên điểm ghim !3d!4d (đúng cửa cơ sở) hơn tâm bản đồ @", () => {
    const url = "https://www.google.com/maps/place/TH+EDU/@20.9600000,105.7800000,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x1!8m2!3d20.9641234!4d105.7911234";
    expect(parseGoogleMapsCoords(url)).toEqual({ lat: 20.9641234, lng: 105.7911234 });
  });
  test("chỉ có @lat,lng", () => {
    expect(parseGoogleMapsCoords("https://www.google.com/maps/@20.95851,105.77902,18z")).toEqual({ lat: 20.95851, lng: 105.77902 });
  });
  test("dạng ?q=lat,lng và ?query=lat%2Clng", () => {
    expect(parseGoogleMapsCoords("https://maps.google.com/?q=20.964,105.7905")).toEqual({ lat: 20.964, lng: 105.7905 });
    expect(parseGoogleMapsCoords("https://www.google.com/maps/search/?api=1&query=20.964%2C105.7905")).toEqual({ lat: 20.964, lng: 105.7905 });
  });
  test("link rút gọn / toạ độ vô lý → null (không lưu sai)", () => {
    expect(parseGoogleMapsCoords("https://maps.app.goo.gl/AbCdEf123")).toBeNull();
    expect(parseGoogleMapsCoords("https://www.google.com/maps/@120.5,105.7,17z")).toBeNull();
  });
});

describe("Khoảng cách tới cơ sở", () => {
  test("Haversine: 0 khi trùng điểm, ~1,11 km cho 0,01° vĩ độ", () => {
    const p = { lat: 20.96, lng: 105.79 };
    expect(distanceKm(p, p)).toBe(0);
    expect(distanceKm(p, { lat: 20.97, lng: 105.79 })).toBeCloseTo(1.112, 2);
  });
  test("định dạng m / km kiểu Việt Nam", () => {
    expect(formatDistance(0.83)).toBe("850 m");
    expect(formatDistance(0.01)).toBe("50 m");
    expect(formatDistance(3.24)).toBe("3,2 km");
  });
  test("xếp cơ sở gần → xa", () => {
    const campuses = [DEFAULT_CAMPUSES.CS1_XALA, DEFAULT_CAMPUSES.CS2_NGOTHINHAM];
    const nearCs2 = { lat: DEFAULT_CAMPUSES.CS2_NGOTHINHAM.lat + 0.001, lng: DEFAULT_CAMPUSES.CS2_NGOTHINHAM.lng };
    expect(rankByDistance(nearCs2, campuses).map((r) => r.campus.campus)).toEqual(["CS2_NGOTHINHAM", "CS1_XALA"]);
  });
});

describe("Link chỉ đường 1 chạm", () => {
  const verified = { ...DEFAULT_CAMPUSES.CS1_XALA, lat: 20.9641, lng: 105.7911, locationVerified: true };
  test("toạ độ đã xác minh → dẫn thẳng tới toạ độ, xuất phát từ vị trí hiện tại", () => {
    const u = new URL(googleDirectionsUrl(verified));
    expect(u.origin + u.pathname).toBe("https://www.google.com/maps/dir/");
    expect(u.searchParams.get("destination")).toBe("20.9641,105.7911");
    expect(u.searchParams.has("origin")).toBe(false);
    expect(new URL(appleDirectionsUrl(verified)).searchParams.get("daddr")).toBe("20.9641,105.7911");
  });
  test("toạ độ chưa xác minh → chỉ đường theo địa chỉ chữ", () => {
    const u = new URL(googleDirectionsUrl(DEFAULT_CAMPUSES.CS1_XALA));
    expect(u.searchParams.get("destination")).toBe("Số 26 LK2, Khu đô thị Xa La, Hà Đông, Hà Nội");
  });
  test("gọi điện: số quốc tế → số nội địa", () => {
    expect(telHref("+84978951289")).toBe("tel:0978951289");
  });
});
