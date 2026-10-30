// Logic thuần cho lời nhắc "Cài TH EDU Companion ra màn hình chính" — không đụng window, test được.

export type InstallOS = "ios" | "android" | "other";
export type InstallBrowser = "safari" | "chrome" | "edge" | "samsung" | "firefox" | "other";
/** Trình duyệt nhúng trong ứng dụng khác (Zalo, Facebook…) — không cài được PWA, phải mở bằng Safari / Chrome */
export type InAppBrowser = "zalo" | "facebook" | "messenger" | "instagram" | "tiktok" | "line" | null;

export type PlatformInfo = { os: InstallOS; browser: InstallBrowser; inApp: InAppBrowser };

/**
 * Nhận diện thiết bị + trình duyệt từ user agent.
 * iPadOS 13+ giả làm Mac ("MacIntel") → nhận ra nhờ màn hình cảm ứng (maxTouchPoints > 1).
 */
export function detectPlatform(ua: string, platform = "", maxTouchPoints = 0): PlatformInfo {
  const ios = /iphone|ipad|ipod/i.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
  const android = !ios && /android/i.test(ua);
  const inApp: InAppBrowser = /zalo/i.test(ua)
    ? "zalo"
    : /messenger|fb_iab.*messenger|\bFBAN\/Messenger/i.test(ua)
      ? "messenger"
      : /FBAN|FBAV|FB_IAB/i.test(ua)
        ? "facebook"
        : /instagram/i.test(ua)
          ? "instagram"
          : /musical_ly|bytedancewebview|tiktok/i.test(ua)
            ? "tiktok"
            : /\bline\//i.test(ua)
              ? "line"
              : null;
  const browser: InstallBrowser = /edg(a|ios)?\//i.test(ua)
    ? "edge"
    : /samsungbrowser/i.test(ua)
      ? "samsung"
      : /fxios|firefox/i.test(ua)
        ? "firefox"
        : /crios|chrome/i.test(ua)
          ? "chrome"
          : ios && /safari/i.test(ua)
            ? "safari"
            : "other";
  return { os: ios ? "ios" : android ? "android" : "other", browser, inApp };
}

export const INSTALL_KEYS = {
  visits: "th-edu:visits",
  dismissedAt: "th-edu:install-dismissed-at",
  dismissals: "th-edu:install-dismissals",
  installed: "th-edu:pwa-installed",
} as const;

/** Bỏ qua lần 1 → im 7 ngày, lần 2 → 21 ngày, lần 3 → không nhắc nữa (không làm phiền). */
export const SNOOZE_DAYS = [7, 21] as const;
export const MAX_DISMISSALS = 3;
/** Không nhắc ngay lần đầu mở app — từ lần mở thứ 2 */
export const MIN_VISITS = 2;

export type InstallState = {
  os: InstallOS;
  standalone: boolean;
  installed: boolean;
  visits: number;
  dismissals: number;
  dismissedAt: number;
};

/** Có nên hiện lời nhắc lúc này không. */
export function shouldOfferInstall(s: InstallState, now: number): boolean {
  if (s.os === "other" || s.standalone || s.installed) return false;
  if (s.visits < MIN_VISITS || s.dismissals >= MAX_DISMISSALS) return false;
  if (s.dismissals > 0 && s.dismissedAt) {
    const days = SNOOZE_DAYS[Math.min(s.dismissals, SNOOZE_DAYS.length) - 1] ?? 0;
    if (now - s.dismissedAt < days * 86_400_000) return false;
  }
  return true;
}

export type GuideKind = "ios-safari" | "ios-other" | "in-app" | "android-manual";

/** Hướng dẫn cài tay phù hợp (khi trình duyệt không có hộp thoại cài tự động). */
export function guideFor(p: PlatformInfo): GuideKind {
  if (p.inApp) return "in-app";
  if (p.os === "ios") return p.browser === "safari" ? "ios-safari" : "ios-other";
  return "android-manual";
}

export const IN_APP_LABEL: Record<NonNullable<InAppBrowser>, string> = {
  zalo: "Zalo",
  facebook: "Facebook",
  messenger: "Messenger",
  instagram: "Instagram",
  tiktok: "TikTok",
  line: "LINE",
};
