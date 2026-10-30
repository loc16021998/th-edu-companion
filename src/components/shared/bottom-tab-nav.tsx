"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, LayoutGrid, Search, type LucideIcon } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** Bảng "Menu" từ ngần này mục trở lên → có ô tìm chức năng */
const SEARCH_FROM = 10;
/** So khớp không dấu: "lich hen" tìm ra "Lịch hẹn trao đổi" */
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();

/** Nhãn không bao giờ bị cắt "…": máy bật cỡ chữ lớn / màn hẹp → tự xuống dòng (tối đa 2 dòng, ngắt giữa các từ). */
const LABEL = "max-w-full text-balance text-center [overflow-wrap:anywhere] lg:whitespace-nowrap";

export type TabItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Mô tả ngắn trong bảng "Thêm" */
  description?: string;
  /** Huy hiệu số (thông báo / tin chưa đọc, đơn chờ duyệt…); 0 / không có = ẩn */
  badge?: number;
  /** Các trang khác cũng làm tab này sáng (vd. tab "Học tập" sáng khi ở Bài tập, Chuyên cần, Lịch học) */
  match?: readonly string[];
  /** Nhóm trong bảng "Thêm" */
  group?: string;
};

/** Huy hiệu đỏ góc trên phải biểu tượng. */
export function NavBadge({ count, className }: { count?: number; className?: string }) {
  if (!count) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "absolute -right-2 -top-1.5 flex h-[18px] min-w-[18px] animate-in zoom-in-50 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background tabular-nums",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function isTabActive(pathname: string, tab: Pick<TabItem, "href" | "match">) {
  return [tab.href, ...(tab.match ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Thanh điều hướng kiểu app (Zalo / Facebook):
 *  - Điện thoại: cố định đáy màn hình, chừa vùng an toàn (thanh cử chỉ Android / iPhone); tab đang mở nổi bật
 *    (biểu tượng phóng nhẹ + nền & chữ màu thương hiệu), huy hiệu số chưa đọc.
 *  - `more`: mục phụ gom vào nút "Thêm" → Bottom Sheet (chia nhóm theo `group`).
 *  - Máy tính: `desktop="inline"` → thành thanh tab phía trên (giáo viên); `"hidden"` → ẩn (đã có menu dọc).
 *  - `preserve`: query param giữ nguyên khi chuyển tab (vd. ?child=, ?class=).
 */
export function BottomTabNav({
  tabs,
  more = [],
  preserve,
  ariaLabel,
  moreLabel = "Thêm",
  moreIcon: MoreIcon = LayoutGrid,
  desktop = "inline",
}: {
  tabs: readonly TabItem[];
  more?: readonly TabItem[];
  preserve: readonly string[];
  ariaLabel: string;
  moreLabel?: string;
  moreIcon?: LucideIcon;
  desktop?: "inline" | "hidden";
}) {
  const realPathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  // Tab sáng NGAY khi chạm (không đợi máy chủ trả trang) — tự hết hiệu lực khi đường dẫn thật đổi
  const [tapped, setTapped] = useState<{ href: string; from: string } | null>(null);
  const pathname = tapped && tapped.from === realPathname ? tapped.href : realPathname;
  const onTap = (href: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    setTapped({ href, from: realPathname });
  };

  const kept = new URLSearchParams();
  for (const key of preserve) {
    const value = searchParams.get(key);
    if (value) kept.set(key, value);
  }
  const qs = kept.toString();
  const hrefOf = (href: string) => (qs ? `${href}?${qs}` : href);
  // Tab chính khớp trước; mục "Thêm" chỉ sáng khi không tab chính nào khớp
  const activeTab = tabs.find((t) => isTabActive(pathname, t));
  const moreActive = activeTab ? undefined : more.find((m) => isTabActive(pathname, m));
  const moreBadge = more.reduce((sum, m) => sum + (m.badge ?? 0), 0);
  const inlineDesktop = desktop === "inline";

  const mobileCount = tabs.length + (more.length ? 1 : 0);
  /** Từ 6 ô trở lên trên điện thoại → thu gọn ô biểu tượng + chữ */
  const dense = mobileCount >= 6;

  const itemClass = (active: boolean) =>
    cn(
      "group flex min-h-[3.75rem] w-full select-none flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 transition-colors [-webkit-tap-highlight-color:transparent]",
      inlineDesktop && "lg:min-h-11 lg:flex-row lg:gap-2.5 lg:px-3 lg:py-2",
      dense ? "text-xs leading-tight max-[359px]:px-0.5 max-[359px]:text-xs md:text-xs lg:text-xs" : "text-xs leading-tight max-[379px]:text-xs max-[339px]:text-xs md:text-xs lg:text-sm",
      active ? "font-bold text-primary lg:bg-primary/10" : "font-semibold text-muted-foreground active:text-foreground md:hover:text-foreground lg:hover:bg-muted",
    );
  const pillClass = (active: boolean) =>
    cn(
      "flex h-8 shrink-0 items-center justify-center rounded-full transition-all duration-200 ease-out group-active:scale-90",
      inlineDesktop && "lg:h-auto lg:w-auto lg:bg-transparent",
      dense ? "w-11 max-[359px]:w-9" : "w-14 max-[379px]:w-12",
      active && "bg-primary/15",
    );
  const iconClass = (active: boolean) => cn("size-5 transition-transform duration-200 ease-out", active && "scale-110");

  const renderTab = (tab: TabItem, active: boolean, extraClass?: string) => {
    const { href, label, icon: Icon, badge } = tab;
    return (
      <li key={href} className={cn("min-w-0 flex-auto", extraClass)}>
        <Link
          href={hrefOf(href)}
          // Tải sẵn TOÀN BỘ trang của tab chính (không chỉ khung loading) → chạm là hiện ngay
          prefetch
          onClick={onTap(href)}
          aria-current={active ? "page" : undefined}
          aria-label={badge ? `${label} (${badge} mới)` : undefined}
          title={label}
          className={itemClass(active)}
        >
          <span className={pillClass(active)}>
            <span className="relative">
              <Icon className={iconClass(active)} strokeWidth={active ? 2.5 : 2} />
              <NavBadge count={badge} />
            </span>
          </span>
          <span className={LABEL}>{label}</span>
        </Link>
      </li>
    );
  };

  const searchable = more.length >= SEARCH_FROM;
  const shown = useMemo(() => {
    const q = fold(query.trim());
    return q ? more.filter((m) => fold(`${m.label} ${m.group ?? ""} ${m.description ?? ""}`).includes(q)) : more;
  }, [more, query]);
  const groups = [...new Set(shown.map((m) => m.group ?? ""))];
  const withDescriptions = more.some((m) => m.description);

  // Mở Menu → cuộn tới chức năng đang dùng (danh sách dài của quản trị); đóng → xoá ô tìm
  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const t = window.setTimeout(() => listRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "center" }), 320);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <>
      <nav
        aria-label={ariaLabel}
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-white/60 bg-white/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(30,79,176,0.08)] backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-white/75 print:hidden",
          inlineDesktop ? "md:static md:order-first md:mb-6 md:rounded-2xl md:border md:bg-card md:pb-0 md:shadow-sm" : "md:hidden",
        )}
      >
        <ul
          className={cn(
            "mx-auto flex",
            inlineDesktop && "md:max-w-none md:gap-1.5 md:p-1.5",
            dense ? "max-w-lg px-1.5 max-[359px]:px-0.5" : "max-w-md px-2 max-[359px]:px-1",
          )}
        >
          {tabs.map((t) => renderTab(t, t === activeTab))}
          {/* Máy tính: mục phụ hiện cùng hàng */}
          {inlineDesktop && more.map((t) => renderTab(t, t === moreActive, "hidden md:block"))}
          {more.length > 0 && (
            <li className={cn("min-w-0 flex-auto", inlineDesktop && "md:hidden")}>
              <button
                type="button"
                onClick={() => setOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={moreBadge ? `${moreLabel} (${moreBadge} mới)` : undefined}
                className={itemClass(!!moreActive)}
              >
                {/* Luôn là "Menu" (không đổi thành tên trang đang mở) → lúc nào cũng tìm thấy để chuyển chức năng khác;
                    đang ở 1 chức năng trong Menu → nút được tô sáng */}
                <span className={pillClass(!!moreActive)}>
                  <span className="relative">
                    <MoreIcon className={iconClass(!!moreActive)} strokeWidth={moreActive ? 2.5 : 2} />
                    <NavBadge count={moreBadge} />
                  </span>
                </span>
                <span className={LABEL}>{moreLabel}</span>
              </button>
            </li>
          )}
        </ul>
      </nav>

      {more.length > 0 && (
        <Sheet open={open} onOpenChange={setOpen}>
          {/* Khung cố định: tiêu đề + ô tìm đứng yên, chỉ danh sách chức năng cuộn lên / xuống; chiều cao không đổi khi lọc */}
          <SheetContent fixed className={cn("h-[85dvh] sm:h-[80dvh]", inlineDesktop && "md:hidden")}>
            <SheetHeader className="shrink-0">
              <SheetTitle>{moreLabel === "Thêm" ? "Mục khác" : moreLabel}</SheetTitle>
              <SheetDescription className={moreActive ? "text-xs" : "sr-only"}>
                {moreActive ? <>Đang mở: <b className="text-foreground">{moreActive.label}</b> — chạm chức năng khác để chuyển</> : "Các mục khác của ứng dụng"}
              </SheetDescription>
            </SheetHeader>
            {searchable && (
              <label className="relative mb-3 block shrink-0">
                <span className="sr-only">Tìm chức năng</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tìm chức năng… (vd. lịch hẹn, học phí)"
                  className="h-11 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
            )}
            <div ref={listRef} className="-mx-4 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-2 sm:-mx-6 sm:px-6">
              {shown.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Không tìm thấy chức năng “{query}”.</p>}
              {groups.map((group) => (
                <div key={group || "all"} className="space-y-1.5">
                  {group && <p className="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{group}</p>}
                  <ul className={cn(withDescriptions ? "space-y-1.5" : "grid grid-cols-2 gap-1.5")}>
                    {shown
                      .filter((m) => (m.group ?? "") === group)
                      .map((m) => {
                        const { href, label, icon: Icon, description, badge } = m;
                        const active = m === moreActive;
                        return (
                          <li key={href}>
                            <Link
                              href={hrefOf(href)}
                              onClick={(e) => {
                                onTap(href)(e);
                                setOpen(false);
                              }}
                              aria-current={active ? "page" : undefined}
                              className={cn(
                                "flex items-center gap-3 rounded-2xl ring-1 transition-colors active:scale-[0.98]",
                                withDescriptions ? "p-3" : "min-h-14 p-2.5",
                                active ? "bg-primary/10 ring-primary/30" : "bg-card ring-border active:bg-muted",
                              )}
                            >
                              <span
                                className={cn(
                                  "relative flex shrink-0 items-center justify-center rounded-xl",
                                  withDescriptions ? "size-11" : "size-9",
                                  active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
                                )}
                              >
                                <Icon className="size-5" />
                                {!withDescriptions && <NavBadge count={badge} />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className={cn("block font-semibold", !withDescriptions && "text-xs leading-tight")}>{label}</span>
                                {description && <span className="block text-xs text-muted-foreground">{description}</span>}
                              </span>
                              {withDescriptions && badge ? (
                                <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white tabular-nums">{badge}</span>
                              ) : null}
                              {withDescriptions && <ChevronRight className="size-4 text-muted-foreground" />}
                            </Link>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
