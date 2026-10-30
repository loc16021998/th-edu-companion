// Skeleton chi tiết cho các trang phụ huynh — dựng lại ĐÚNG khung, padding, line-height của component thật
// (Card điểm danh, bảng học phí, gallery khoảnh khắc, bài tập, nhắn tin) để khi dữ liệu về, các khối đã nằm
// đúng chỗ: không giật, không nhảy bố cục. Đổi bố cục component thật → sửa skeleton tương ứng ở đây.
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function Loading({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <div className={className} role="status" aria-busy="true" aria-live="polite">
      {children}
      {/* Đặt cuối: đứng đầu thì space-y-* đẩy khối đầu tiên xuống, lệch so với trang thật */}
      <span className="sr-only">Đang tải...</span>
    </div>
  );
}

/**
 * 1 dòng chữ giả: dựng 1 dòng chữ VÔ HÌNH đúng kiểu chữ thật (`text`, vd. "text-xs" / "text-sm leading-relaxed")
 * → chiều cao luôn bằng line-height thật, tự khớp khi đổi thang chữ của Design System; thanh shimmer nằm giữa dòng.
 */
function Line({ text, w, bar = "h-[0.7em]", className }: { text: string; w: string; bar?: string; className?: string }) {
  return (
    // Độ rộng `w` đặt cho CẢ DÒNG; thanh xám nằm gọn trong dòng (không tràn khi dòng căn phải / trong flex)
    <div className={cn("relative", text, w, className)} aria-hidden>
      <span className="invisible">&nbsp;</span>
      <Skeleton className={cn("absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-md", bar)} />
    </div>
  );
}

/** Tiêu đề trang text-xl (line-height 28px) */
function PageTitle({ w = "w-44" }: { w?: string }) {
  return <Line text="text-xl" w={w} bar="h-5" />;
}

// ============================================================================ Hôm nay (Nhật ký bài học)

/** Tiêu đề khối (Section): ô biểu tượng 28px + chữ text-base, bên phải là ghi chú text-xs */
function SectionHead({ w = "w-36", aside = true }: { w?: string; aside?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Skeleton className="size-7 rounded-lg" />
        <Line text="text-base" w={w} bar="h-4" />
      </div>
      {aside && <Line text="text-xs" w="w-20" bar="h-3" />}
    </div>
  );
}

/** = StudentCard + SessionBanner + TodayStatus + LessonDiary (3 môn + lời nhắn) + MediaGallery */
export function ParentTodaySkeleton() {
  return (
    <Loading className="space-y-6">
      {/* Thẻ học sinh */}
      <section className="rounded-3xl bg-edu-blue-100 p-5">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full bg-edu-blue-200" />
          <div className="space-y-1">
            <Line text="text-xs" w="w-16" bar="h-2.5 bg-edu-blue-200" />
            <Line text="text-2xl leading-tight" w="w-44" bar="h-5 bg-edu-blue-200" />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Skeleton className="h-7 w-20 rounded-full bg-edu-blue-200" />
          <Skeleton className="h-7 w-28 rounded-full bg-edu-blue-200" />
          <Skeleton className="h-7 w-16 rounded-full bg-edu-blue-200" />
        </div>
      </section>
      {/* Buổi học hôm nay */}
      <div className="flex items-center gap-3 rounded-2xl bg-slate-100 p-3">
        <Skeleton className="size-10 rounded-xl bg-white/70" />
        <div className="flex-1">
          <Line text="text-sm" w="w-48" bar="h-3.5 bg-slate-200" />
          <Line text="text-xs" w="w-32" bar="h-3 bg-slate-200" />
        </div>
      </div>
      {/* Hôm nay của con: điểm danh + tâm trạng */}
      <section className="space-y-3">
        <SectionHead w="w-32" />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-2xl bg-card p-4 shadow-neu ring-1 ring-border">
              <Line text="text-xs" w="w-16" bar="h-3" />
              <div className="mt-1 flex h-9 items-center gap-2">
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          ))}
        </div>
      </section>
      {/* Nhật ký bài học: 3 môn + lời nhắn của cô */}
      <section className="space-y-3">
        <SectionHead w="w-32" />
        <div className="space-y-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
          {/* Mỗi môn: tên + sao, nhận xét text-sm leading-relaxed (thường 1–2 dòng) */}
          <ul className="divide-y">
            {[2, 2, 1].map((lines, i) => (
              <li key={i} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <Skeleton className="size-10 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <Line text="text-base" w="w-28" bar="h-4" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="mt-0.5">
                    <Line text="text-sm leading-relaxed" w="w-full" bar="h-3" />
                    {lines === 2 && <Line text="text-sm leading-relaxed" w="w-3/5" bar="h-3" />}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {/* Lời nhắn của cô: tiêu đề text-xs + 3 dòng chữ 16px */}
          <div className="rounded-xl bg-pink-50 p-4 ring-1 ring-pink-100">
            <Line text="text-xs" w="w-36" bar="h-3 bg-pink-100" className="mb-1" />
            <Line text="text-base leading-relaxed" w="w-full" bar="h-3.5 bg-pink-100" />
            <Line text="text-base leading-relaxed" w="w-full" bar="h-3.5 bg-pink-100" />
            <Line text="text-base leading-relaxed" w="w-1/2" bar="h-3.5 bg-pink-100" />
          </div>
        </div>
      </section>
      {/* Gallery ảnh & video */}
      <section className="space-y-3">
        <SectionHead w="w-40" />
        {/* = MediaGallery: ô đầu to gấp đôi (2×2) + 5 ô nhỏ */}
        <div className="grid grid-cols-3 gap-1.5 overflow-hidden rounded-2xl">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className={cn("aspect-square rounded-none", i === 0 && "col-span-2 row-span-2")} />
          ))}
        </div>
      </section>
    </Loading>
  );
}

// ============================================================================ Chuyên cần (Card điểm danh)

/** = PeriodFilter + AttendanceStats + MonthCalendar */
export function ParentAttendanceSkeleton() {
  return (
    <Loading className="space-y-5">
      <PageTitle w="w-48" />
      {/* PeriodFilter */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 rounded-full bg-muted p-1">
          <div className="h-[38px] rounded-full bg-background shadow-sm" />
          <div className="h-[38px]" />
        </div>
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-card p-1.5 shadow-sm ring-1 ring-border">
          <Skeleton className="size-10 rounded-xl" />
          <Line text="text-base" w="w-28" bar="h-4" />
          <Skeleton className="size-10 rounded-xl" />
        </div>
      </div>
      {/* AttendanceStats: hàng tỉ lệ chuyên cần + 4 ô (số text-xl + nhãn text-xs, "Nghỉ có phép" 2 dòng) */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 rounded-2xl bg-edu-leaf-100 p-3 ring-1 ring-green-200">
          <Line text="text-2xl" w="w-14" bar="h-6 bg-green-200" />
          <div className="min-w-0 flex-1">
            <Line text="text-xs" w="w-28" bar="h-3 bg-green-200" />
            <Skeleton className="mt-1 h-2 w-full rounded-full bg-white/80" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col items-center justify-center rounded-2xl bg-muted/70 p-2">
              <Line text="text-xl" w="w-8" bar="h-5" />
              <Line text="text-xs leading-tight" w="w-12" bar="h-3" />
              <Line text="text-xs leading-tight" w="w-8" bar="h-3" />
            </div>
          ))}
        </div>
      </div>
      {/* MonthCalendar */}
      <div className="rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
        <div className="mb-1 grid grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => (
            <Line key={i} text="text-xs py-1" w="w-4" bar="h-2.5" className="justify-center" />
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
          {["w-[4.5rem]", "w-20", "w-14", "w-28", "w-32"].map((w) => (
            <Line key={w} text="text-xs" w={w} bar="h-2.5" />
          ))}
        </div>
      </div>
    </Loading>
  );
}

// ============================================================================ Học phí (bảng học phí)

function FeeRow({ withPay }: { withPay: boolean }) {
  return (
    <li className="flex gap-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
      <Skeleton className="size-11 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        {/* Tên khoản thu (16px, thường 2 dòng: "Học phí tháng 11/2026") + số tiền */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Line text="text-base leading-snug" w="w-28" bar="h-4" />
            <Line text="text-base leading-snug" w="w-16" bar="h-4" />
          </div>
          <Line text="text-base" w="w-20" bar="h-4" />
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Line text="text-xs" w="w-24" bar="h-3" />
        </div>
        {/* PayNow: nút "Thanh toán ngay" */}
        {withPay && <Skeleton className="mt-3 h-10 w-full rounded-xl" />}
      </div>
    </li>
  );
}

/** = FeeSummary (thẻ cam) + FeeList (nhóm "Cần thanh toán" / "Đã thanh toán") */
export function ParentFeesSkeleton() {
  return (
    <Loading className="space-y-5">
      <PageTitle w="w-28" />
      <section className="rounded-3xl bg-amber-100 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Line text="text-sm" w="w-24" bar="h-3.5 bg-amber-200" />
            <Line text="text-3xl" w="w-44" bar="h-7 bg-amber-200" className="mt-1" />
          </div>
          <Skeleton className="h-[22px] w-20 rounded-full bg-amber-200" />
        </div>
        <div className="mt-4">
          <Skeleton className="h-2.5 w-full rounded-full bg-amber-200" />
          <div className="mt-2 flex justify-between">
            <Line text="text-xs" w="w-24" bar="h-3 bg-amber-200" />
            <Line text="text-xs" w="w-24" bar="h-3 bg-amber-200" />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Skeleton className="h-7 w-32 rounded-full bg-amber-200" />
        </div>
      </section>
      <div className="space-y-5">
        <div className="space-y-2.5">
          <Line text="text-sm" w="w-32" bar="h-3.5" />
          <ul className="space-y-2.5">
            <FeeRow withPay />
            <FeeRow withPay />
          </ul>
        </div>
        <div className="space-y-2.5">
          <Line text="text-sm" w="w-28" bar="h-3.5" />
          <ul className="space-y-2.5">
            <FeeRow withPay={false} />
          </ul>
        </div>
      </div>
    </Loading>
  );
}

// ============================================================================ Góc khoảnh khắc (gallery)

/**
 * = MomentCard: tác giả, lời kể (15px, leading-relaxed), lưới ảnh, thả tim / bình luận.
 * `tiles`: 3 = 1 lớn + 2 nhỏ, 6 = thêm hàng 3 ô (album nhiều ảnh) — cùng quy tắc với Gallery thật.
 */
export function MomentCardSkeleton({ tiles = 3 }: { tiles?: 3 | 6 }) {
  return (
    <article className="space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
      <header className="flex items-start gap-3">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <Line text="text-base" w="w-36" bar="h-4" />
          <Line text="text-xs" w="w-44" bar="h-3" />
        </div>
      </header>
      <div>
        <Line text="text-sm leading-relaxed" w="w-full" bar="h-3.5" />
        <Line text="text-sm leading-relaxed" w="w-3/4" bar="h-3.5" />
      </div>
      <div className="grid grid-cols-3 gap-1 overflow-hidden rounded-xl">
        <Skeleton className="col-span-2 row-span-2 aspect-square rounded-none" />
        {Array.from({ length: tiles - 1 }, (_, i) => (
          <Skeleton key={i} className="aspect-square rounded-none" />
        ))}
      </div>
      <div className="flex items-center gap-1 border-t pt-2">
        <Skeleton className="h-9 w-14 rounded-full" />
        <Skeleton className="h-9 w-14 rounded-full" />
        <Line text="text-xs" w="w-20" bar="h-3" className="ml-auto" />
      </div>
      <Skeleton className="h-10 w-full rounded-full" />
    </article>
  );
}

export function ParentMomentsSkeleton() {
  return (
    <Loading className="space-y-4">
      <div>
        <PageTitle w="w-48" />
        <Line text="text-sm" w="w-full" bar="h-3.5" />
        <Line text="text-sm" w="w-full" bar="h-3.5" />
        <Line text="text-sm" w="w-2/3" bar="h-3.5" />
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        <div className="h-[34px] rounded-lg bg-card shadow-sm" />
        <div className="h-[34px]" />
      </div>
      <MomentCardSkeleton tiles={6} />
      <MomentCardSkeleton />
    </Loading>
  );
}

// ============================================================================ Bài tập về nhà

function HomeworkCardSkeleton() {
  return (
    <article className="space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
      <div className="space-y-1">
        <div className="flex gap-1.5">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <Line text="text-base leading-snug" w="w-48" bar="h-4" />
        <Line text="text-xs" w="w-32" bar="h-3" />
      </div>
      {/* Hướng dẫn của cô (p-3, 2 dòng text-sm leading-relaxed) + nút nộp bài */}
      <div className="rounded-xl bg-muted/60 p-3">
        <Line text="text-sm leading-relaxed" w="w-full" bar="h-3" />
        <Line text="text-sm leading-relaxed" w="w-2/3" bar="h-3" />
      </div>
      <Skeleton className="h-11 w-full rounded-xl" />
    </article>
  );
}

/** = 3 ô thống kê sao + bảng "Ngôi sao chăm chỉ" + thẻ bài tập */
export function ParentHomeworkSkeleton() {
  return (
    <Loading className="space-y-4">
      <div>
        <PageTitle w="w-56" />
        <Line text="text-sm" w="w-full" bar="h-3.5" />
        <Line text="text-sm" w="w-1/2" bar="h-3.5" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className={cn("flex flex-col items-center rounded-2xl p-3", i === 1 ? "bg-amber-50 ring-1 ring-amber-200" : "bg-card shadow-sm ring-1 ring-border")}>
            <Line text="text-2xl" w="w-8" bar="h-6" />
            <Line text="text-xs" w="w-14" bar="h-2.5" />
          </div>
        ))}
      </div>
      <section className="space-y-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
        {/* Tiêu đề + khoảng ngày: trên điện thoại xuống 2 dòng */}
        <div className="flex h-12 items-start justify-between gap-2">
          <div className="space-y-1">
            <Line text="text-base" w="w-32" bar="h-4 bg-amber-100" />
            <Line text="text-base" w="w-20" bar="h-4 bg-amber-100" />
          </div>
          <Line text="text-xs" w="w-16" bar="h-3 bg-amber-100" />
        </div>
        <div className="space-y-1.5">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-xl bg-white/80" />
          ))}
        </div>
      </section>
      <div className="space-y-2">
        <Line text="text-sm" w="w-32" bar="h-3.5" />
        <HomeworkCardSkeleton />
        <HomeworkCardSkeleton />
      </div>
    </Loading>
  );
}

// ============================================================================ Xin nghỉ học

/** = tiêu đề + form gửi đơn (chọn nhanh ngày, khoảng ngày, lý do, ghi chú, nút gửi) + danh sách đơn đã gửi */
export function ParentLeaveSkeleton() {
  return (
    <Loading className="space-y-4">
      <div>
        <PageTitle w="w-36" />
        <Line text="text-sm" w="w-full" bar="h-3.5" />
        <Line text="text-sm" w="w-3/4" bar="h-3.5" />
      </div>
      <div className="space-y-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
        <Line text="text-base" w="w-52" bar="h-4" />
        <div className="flex gap-1.5">
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-11 rounded-xl" />
          <Skeleton className="h-11 rounded-xl" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["w-20", "w-24", "w-16", "w-28"].map((w) => (
            <Skeleton key={w} className={cn("h-9 rounded-full", w)} />
          ))}
        </div>
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-11 rounded-xl" />
      </div>
      <div className="space-y-2">
        <Line text="text-sm" w="w-24" bar="h-3.5" />
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    </Loading>
  );
}

// ============================================================================ Nhắn tin

/** = khung chat chiều cao cố định (cùng công thức với ChatScreen) + danh bạ */
export function ChatSkeleton() {
  return (
    <Loading className="space-y-3">
      <div className="grid h-[calc(100dvh-3.5rem-3rem-5rem-env(safe-area-inset-bottom)-env(safe-area-inset-top))] min-h-[24rem] grid-cols-[minmax(0,1fr)] overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border md:h-[calc(100dvh-3.5rem-3rem-env(safe-area-inset-top))] md:grid-cols-[18rem_1fr]">
        <ul className="divide-y border-r">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="flex items-center gap-3 p-3">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 rounded-md" style={{ width: `${50 + ((i * 17) % 35)}%` }} />
                <Skeleton className="h-3 w-2/3 rounded-md" />
              </div>
            </li>
          ))}
        </ul>
        <div className="hidden md:block" />
      </div>
    </Loading>
  );
}

/** /parent/campuses — tiêu đề, widget đưa đón, bản đồ (chiều cao cố định như thật), 2 nút cơ sở, thẻ chi tiết. */
export function ParentCampusesSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-[15.5rem] rounded-3xl" />
      <Skeleton className="h-64 rounded-3xl sm:h-80" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-16 rounded-2xl" />
      </div>
      <Skeleton className="h-96 rounded-3xl" />
      <span className="sr-only">Đang tải...</span>
    </div>
  );
}

export function ParentAchievementsSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-72 rounded-3xl" />
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-[4.5rem] rounded-2xl" />
        <Skeleton className="h-[4.5rem] rounded-2xl" />
        <Skeleton className="h-[4.5rem] rounded-2xl" />
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
      <span className="sr-only">Đang tải...</span>
    </div>
  );
}
