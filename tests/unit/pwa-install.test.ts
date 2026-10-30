import { MAX_DISMISSALS, detectPlatform, guideFor, shouldOfferInstall, type InstallState } from "@/lib/pwa/install";

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
  iphoneZalo: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Zalo iOS/565 ZaloTheme/light ZaloLanguage/vi",
  ipadOS: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.102 Mobile Safari/537.36",
  androidSamsung: "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  androidFacebook: "Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/489.0.0.0;]",
  desktopChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
};

describe("Nhận diện thiết bị", () => {
  test("iPhone Safari / Chrome / Zalo", () => {
    expect(detectPlatform(UA.iphoneSafari)).toEqual({ os: "ios", browser: "safari", inApp: null });
    expect(detectPlatform(UA.iphoneChrome)).toEqual({ os: "ios", browser: "chrome", inApp: null });
    expect(detectPlatform(UA.iphoneZalo).inApp).toBe("zalo");
  });
  test("iPad (iPadOS giả làm Mac) nhận ra nhờ màn hình cảm ứng", () => {
    expect(detectPlatform(UA.ipadOS, "MacIntel", 5).os).toBe("ios");
    expect(detectPlatform(UA.ipadOS, "MacIntel", 0).os).toBe("other");
  });
  test("Android Chrome / Samsung Internet / Facebook in-app", () => {
    expect(detectPlatform(UA.androidChrome)).toEqual({ os: "android", browser: "chrome", inApp: null });
    expect(detectPlatform(UA.androidSamsung).browser).toBe("samsung");
    expect(detectPlatform(UA.androidFacebook).inApp).toBe("facebook");
  });
  test("máy tính → không nhắc", () => {
    expect(detectPlatform(UA.desktopChrome).os).toBe("other");
  });
  test("hướng dẫn phù hợp từng trình duyệt", () => {
    expect(guideFor(detectPlatform(UA.iphoneSafari))).toBe("ios-safari");
    expect(guideFor(detectPlatform(UA.iphoneChrome))).toBe("ios-other");
    expect(guideFor(detectPlatform(UA.iphoneZalo))).toBe("in-app");
    expect(guideFor(detectPlatform(UA.androidSamsung))).toBe("android-manual");
  });
});

describe("Khi nào nhắc cài đặt", () => {
  const NOW = Date.parse("2026-10-29T10:00:00Z");
  const DAY = 86_400_000;
  const base: InstallState = { os: "ios", standalone: false, installed: false, visits: 2, dismissals: 0, dismissedAt: 0 };

  test("lần mở đầu tiên chưa nhắc; từ lần 2 mới nhắc", () => {
    expect(shouldOfferInstall({ ...base, visits: 1 }, NOW)).toBe(false);
    expect(shouldOfferInstall(base, NOW)).toBe(true);
  });
  test("đã cài / đang mở từ màn hình chính / máy tính → không nhắc", () => {
    expect(shouldOfferInstall({ ...base, standalone: true }, NOW)).toBe(false);
    expect(shouldOfferInstall({ ...base, installed: true }, NOW)).toBe(false);
    expect(shouldOfferInstall({ ...base, os: "other" }, NOW)).toBe(false);
  });
  test("bỏ qua: lần 1 im 7 ngày, lần 2 im 21 ngày, lần 3 thôi hẳn", () => {
    expect(shouldOfferInstall({ ...base, dismissals: 1, dismissedAt: NOW - 6 * DAY }, NOW)).toBe(false);
    expect(shouldOfferInstall({ ...base, dismissals: 1, dismissedAt: NOW - 8 * DAY }, NOW)).toBe(true);
    expect(shouldOfferInstall({ ...base, dismissals: 2, dismissedAt: NOW - 20 * DAY }, NOW)).toBe(false);
    expect(shouldOfferInstall({ ...base, dismissals: 2, dismissedAt: NOW - 22 * DAY }, NOW)).toBe(true);
    expect(shouldOfferInstall({ ...base, dismissals: MAX_DISMISSALS, dismissedAt: NOW - 365 * DAY }, NOW)).toBe(false);
  });
});
