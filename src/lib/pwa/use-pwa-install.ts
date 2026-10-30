"use client";

import { useCallback, useEffect, useState } from "react";
import { INSTALLED_EVENT, INSTALL_READY_EVENT } from "./capture";
import { INSTALL_KEYS, detectPlatform, guideFor, shouldOfferInstall, type GuideKind, type PlatformInfo } from "./install";

/** Mở app rồi mới nhắc — tránh chen ngang lúc phụ huynh vừa vào xem nhật ký */
const SHOW_DELAY_MS = 8_000;

function store() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
const num = (k: string) => Number(store()?.getItem(k) ?? 0) || 0;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export type PWAInstall = {
  /** Đã kiểm tra xong trên trình duyệt (trước đó luôn false — HTML server / client khớp nhau) */
  ready: boolean;
  platform: PlatformInfo | null;
  /** Đang mở từ biểu tượng màn hình chính */
  isStandalone: boolean;
  /** Đã cài (sự kiện appinstalled, hoặc phụ huynh iPhone bấm "Tôi đã thêm xong") */
  isInstalled: boolean;
  /** Chrome / Edge Android: bấm là mở hộp thoại cài đặt của trình duyệt */
  canPromptNative: boolean;
  /** Không có hộp thoại tự động → hướng dẫn cài tay phù hợp thiết bị */
  guide: GuideKind | null;
  /** Đủ điều kiện hiện lời nhắc (điện thoại, chưa cài, không bị hoãn, đã dùng app một lúc) */
  shouldShow: boolean;
  /** Mở hộp thoại cài của trình duyệt (Android). "unavailable" → dùng hướng dẫn tay */
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
  /** Bỏ qua: im 7 ngày → 21 ngày → thôi hẳn */
  dismiss: () => void;
  /** Phụ huynh tự báo đã thêm (iOS không có sự kiện cài đặt) */
  markInstalled: () => void;
};

/**
 * Kiểm tra thiết bị (Safari iOS / Chrome Android…) + trạng thái cài đặt PWA, quyết định có nên nhắc
 * "Cài TH EDU Companion ra màn hình chính" và mở hộp thoại cài đặt của trình duyệt khi có.
 */
export function usePWAInstall(): PWAInstall {
  const [ready, setReady] = useState(false);
  const [platform, setPlatform] = useState<PlatformInfo | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [eligible, setEligible] = useState(false);
  const [timeUp, setTimeUp] = useState(false);

  useEffect(() => {
    const ls = store();
    const p = detectPlatform(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
    // Đếm số lần mở app (mỗi phiên trình duyệt 1 lần)
    let visits = num(INSTALL_KEYS.visits);
    try {
      if (!sessionStorage.getItem(INSTALL_KEYS.visits)) {
        visits += 1;
        ls?.setItem(INSTALL_KEYS.visits, String(visits));
        sessionStorage.setItem(INSTALL_KEYS.visits, "1");
      }
    } catch {}
    const state = {
      os: p.os,
      standalone: isStandalone(),
      installed: ls?.getItem(INSTALL_KEYS.installed) === "1",
      visits,
      dismissals: num(INSTALL_KEYS.dismissals),
      dismissedAt: num(INSTALL_KEYS.dismissedAt),
    };
    setPlatform(p);
    setStandalone(state.standalone);
    setInstalled(state.installed);
    setEligible(shouldOfferInstall(state, Date.now()));
    setDeferred(window.__thInstallPrompt ?? null);
    setReady(true);

    const onReady = () => setDeferred(window.__thInstallPrompt ?? null);
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    // Mở app từ màn hình chính trong lúc tab cũ còn mở → cập nhật
    const mq = window.matchMedia("(display-mode: standalone)");
    const onMode = () => setStandalone(isStandalone());
    window.addEventListener(INSTALL_READY_EVENT, onReady);
    window.addEventListener(INSTALLED_EVENT, onInstalled);
    mq.addEventListener?.("change", onMode);
    const t = window.setTimeout(() => setTimeUp(true), SHOW_DELAY_MS);
    return () => {
      window.removeEventListener(INSTALL_READY_EVENT, onReady);
      window.removeEventListener(INSTALLED_EVENT, onInstalled);
      mq.removeEventListener?.("change", onMode);
      window.clearTimeout(t);
    };
  }, []);

  const dismiss = useCallback(() => {
    const ls = store();
    ls?.setItem(INSTALL_KEYS.dismissals, String(num(INSTALL_KEYS.dismissals) + 1));
    ls?.setItem(INSTALL_KEYS.dismissedAt, String(Date.now()));
    setEligible(false);
  }, []);

  const markInstalled = useCallback(() => {
    store()?.setItem(INSTALL_KEYS.installed, "1");
    setInstalled(true);
  }, []);

  // Hộp thoại cài tự động chỉ dùng trên Android (iOS không có; trình duyệt nhúng Zalo / Facebook không cài được)
  const native = platform?.os === "android" && !platform.inApp ? deferred : null;

  const promptInstall = useCallback(async () => {
    const e = native ?? (platform?.os === "android" && !platform.inApp ? window.__thInstallPrompt : null);
    if (!e) return "unavailable" as const;
    try {
      await e.prompt();
      const { outcome } = await e.userChoice;
      if (outcome === "accepted") markInstalled();
      return outcome;
    } catch (err) {
      // Sự kiện đã dùng / hết hạn → chuyển sang hướng dẫn cài tay thay vì đứng im
      console.warn("[pwa] Không mở được hộp thoại cài đặt:", err);
      return "unavailable" as const;
    } finally {
      // Mỗi sự kiện chỉ dùng được 1 lần — Chrome bắn sự kiện mới nếu còn cài được
      window.__thInstallPrompt = null;
      setDeferred(null);
    }
  }, [native, platform, markInstalled]);

  const supported = platform?.os === "ios" || platform?.os === "android";
  return {
    ready,
    platform,
    isStandalone: standalone,
    isInstalled: installed || standalone,
    canPromptNative: !!native,
    guide: platform && !native ? guideFor(platform) : null,
    shouldShow: ready && supported && eligible && timeUp && !installed && !standalone,
    promptInstall,
    dismiss,
    markInstalled,
  };
}
