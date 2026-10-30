"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Enums } from "@/types/database.types";
import { cn } from "@/lib/utils";
import { SELECTED_CHILD_COOKIE, SELECTED_CHILD_MAX_AGE, SELECTED_CHILD_STORAGE, isChildId, pickChild } from "../selected-child";

export type FamilyChild = { id: string; full_name: string; avatar_url: string | null; class_name: string; campus: Enums<"campus"> };

type SelectedStudentValue = {
  students: FamilyChild[];
  activeStudentId: string | null;
  activeStudent: FamilyChild | null;
  /** Đổi bé đang xem: lưu lựa chọn + tải lại dữ liệu của trang hiện tại theo bé mới */
  setActiveStudent: (id: string) => void;
  /** Đang tải dữ liệu của bé vừa chọn (giữ giao diện cũ, làm mờ nhẹ) */
  isSwitching: boolean;
};

const SelectedStudentContext = createContext<SelectedStudentValue | null>(null);

/** Tham số chỉ đúng với bé cũ (phân trang, bài đăng đang mở…) — bỏ khi đổi bé */
const DROP_ON_SWITCH = ["before", "m"];

function remember(id: string) {
  // Trang đã lưu ngoại tuyến (service worker) là của bé cũ → xoá, tránh mở app thấy thông tin bé khác
  navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_PAGES_CACHE" });
  document.cookie = `${SELECTED_CHILD_COOKIE}=${id}; Path=/; Max-Age=${SELECTED_CHILD_MAX_AGE}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  try {
    localStorage.setItem(SELECTED_CHILD_STORAGE, id);
  } catch {
    // Chế độ riêng tư / bị chặn bộ nhớ → cookie vẫn đủ dùng
  }
}

const readCookie = () => document.cookie.split("; ").find((c) => c.startsWith(`${SELECTED_CHILD_COOKIE}=`))?.slice(SELECTED_CHILD_COOKIE.length + 1) ?? null;

/**
 * Bé đang xem của phụ huynh nhiều con — dùng chung cho header, mọi trang và lời chào.
 * Thứ tự ưu tiên: ?child= trên URL (link thông báo, chia sẻ) → lựa chọn lần trước (cookie, server đã đọc → `initialId`)
 * → localStorage (khi trình duyệt xoá cookie) → bé đầu tiên. Dữ liệu trang do server tải theo đúng bé này.
 */
export function SelectedStudentProvider({ students, initialId, children }: { students: FamilyChild[]; initialId: string | null; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isSwitching, startTransition] = useTransition();

  const fromUrl = params.get("child");
  const activeStudent = pickChild(students, fromUrl, initialId);
  const activeStudentId = activeStudent?.id ?? null;

  // Mở bằng link có ?child= (thông báo đẩy, Zalo) → ghi nhớ luôn bé đó cho các lần mở sau
  useEffect(() => {
    if (activeStudentId && fromUrl === activeStudentId && readCookie() !== activeStudentId) remember(activeStudentId);
  }, [activeStudentId, fromUrl]);

  // Trình duyệt đã xoá cookie nhưng còn localStorage → khôi phục lựa chọn rồi tải lại dữ liệu theo đúng bé
  useEffect(() => {
    if (fromUrl || students.length < 2 || readCookie()) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(SELECTED_CHILD_STORAGE);
    } catch {}
    if (isChildId(saved) && saved !== activeStudentId && students.some((s) => s.id === saved)) {
      remember(saved);
      startTransition(() => router.refresh());
    }
    // Chỉ chạy 1 lần khi vào khu phụ huynh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setActiveStudent = useCallback(
    (id: string) => {
      if (id === activeStudentId || !students.some((s) => s.id === id)) return;
      remember(id);
      const next = new URLSearchParams(params);
      next.set("child", id);
      for (const k of DROP_ON_SWITCH) next.delete(k);
      startTransition(() => router.push(`${pathname}?${next}`, { scroll: false }));
    },
    [activeStudentId, students, params, pathname, router],
  );

  const value = useMemo(
    () => ({ students, activeStudentId, activeStudent, setActiveStudent, isSwitching }),
    [students, activeStudentId, activeStudent, setActiveStudent, isSwitching],
  );
  return <SelectedStudentContext.Provider value={value}>{children}</SelectedStudentContext.Provider>;
}

export function useSelectedStudent(): SelectedStudentValue {
  const ctx = useContext(SelectedStudentContext);
  if (!ctx) throw new Error("useSelectedStudent() phải nằm trong <SelectedStudentProvider>");
  return ctx;
}

/** Bọc nội dung trang phụ huynh: đang đổi bé → làm mờ nhẹ + báo cho trình đọc màn hình (không nhảy bố cục). */
export function SwitchingArea({ children, className }: { children: React.ReactNode; className?: string }) {
  const ctx = useContext(SelectedStudentContext);
  const switching = ctx?.isSwitching ?? false;
  return (
    <div className={cn("transition-opacity duration-150", switching && "pointer-events-none opacity-60", className)} aria-busy={switching}>
      {children}
    </div>
  );
}
