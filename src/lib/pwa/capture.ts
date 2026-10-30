// Script nhỏ chạy trong <head> (trước React): giữ lại sự kiện cài đặt của Chrome / Edge Android để hook dùng sau.
// Không giữ → sự kiện bắn trước khi component gắn listener là mất, nút "Cài đặt ngay" không mở được hộp thoại.

export const INSTALL_READY_EVENT = "th-edu:install-ready";
export const INSTALLED_EVENT = "th-edu:installed";

declare global {
  interface Window {
    __thInstallPrompt?: BeforeInstallPromptEvent | null;
  }
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  }
}

export const INSTALL_CAPTURE_SCRIPT = `(function(){try{
window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__thInstallPrompt=e;window.dispatchEvent(new Event("${INSTALL_READY_EVENT}"))});
window.addEventListener("appinstalled",function(){window.__thInstallPrompt=null;try{localStorage.setItem("th-edu:pwa-installed","1")}catch(_){}window.dispatchEvent(new Event("${INSTALLED_EVENT}"))});
}catch(_){}})();`;
