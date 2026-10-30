// Skeleton theo bố cục thật của từng trang (dùng trong loading.tsx) — tránh nhảy layout khi dữ liệu về.
import { Skeleton } from "@/components/ui/skeleton";

function Loading({ children, className = "space-y-6" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={className} role="status" aria-busy="true" aria-live="polite">
      {children}
      {/* Đặt cuối: đứng đầu thì space-y-* đẩy khối đầu tiên xuống, lệch so với trang thật */}
      <span className="sr-only">Đang tải...</span>
    </div>
  );
}

function SectionTitle() {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="size-7 rounded-lg" />
      <Skeleton className="h-5 w-40" />
    </div>
  );
}

/** Danh sách hàng: avatar/icon + 2 dòng chữ. */
export function ListRowsSkeleton({ rows = 5, trailing = false }: { rows?: number; trailing?: boolean }) {
  return (
    <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
            <Skeleton className="h-3 w-24" />
          </div>
          {trailing && <Skeleton className="h-8 w-20 rounded-lg" />}
        </li>
      ))}
    </ul>
  );
}

// ----------------------------------------------------------------------------- Phụ huynh

export function ParentDashboardSkeleton() {
  return (
    <Loading>
      {/* Thẻ học sinh */}
      <div className="rounded-3xl bg-sky-100 p-5">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full bg-sky-200" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-16 bg-sky-200" />
            <Skeleton className="h-6 w-44 bg-sky-200" />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Skeleton className="h-6 w-20 rounded-full bg-sky-200" />
          <Skeleton className="h-6 w-28 rounded-full bg-sky-200" />
        </div>
      </div>
      {/* Điểm danh + tâm trạng */}
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
      {/* Nhật ký buổi học */}
      <div className="space-y-3">
        <SectionTitle />
        <div className="space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      </div>
      {/* Ảnh & video */}
      <div className="space-y-3">
        <SectionTitle />
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      </div>
    </Loading>
  );
}

export function ParentHistorySkeleton() {
  return (
    <Loading className="space-y-5">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-10 rounded-full" />
      <Skeleton className="h-14 rounded-2xl" />
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
      <div className="rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 35 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      </div>
    </Loading>
  );
}

export function NotificationsSkeleton() {
  return (
    <Loading className="space-y-5">
      <Skeleton className="h-7 w-28" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-28 rounded-full" />
      </div>
      <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="flex gap-3 p-4">
            <Skeleton className="size-10 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4" style={{ width: `${60 + ((i * 13) % 30)}%` }} />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-32" />
            </div>
          </li>
        ))}
      </ul>
    </Loading>
  );
}

// ----------------------------------------------------------------------------- Giáo viên

export function TeacherDashboardSkeleton() {
  return (
    <Loading>
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-32 rounded-2xl bg-emerald-100" />
        <Skeleton className="h-32 rounded-2xl bg-orange-100" />
      </div>
      <div className="space-y-3">
        <div className="flex items-end justify-between">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="space-y-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
              <div className="flex justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-7 w-14 rounded-full" />
              </div>
              <div className="space-y-3">
                <Skeleton className="h-2 w-full rounded-full" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Skeleton className="h-10 rounded-xl" />
                <Skeleton className="h-10 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Loading>
  );
}

function ClassDatePickerSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="space-y-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-11 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export function TeacherAttendanceSkeleton() {
  return (
    <Loading className="space-y-4">
      <Skeleton className="h-7 w-32" />
      <ClassDatePickerSkeleton />
      <div className="flex gap-2">
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="ml-auto h-8 w-32 rounded-full" />
      </div>
      <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i} className="space-y-2 p-3 sm:flex sm:items-center sm:gap-3 sm:space-y-0">
            <div className="flex items-center gap-3 sm:w-56">
              <Skeleton className="size-9 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
            {/* Nút điểm danh: biểu tượng trên chữ (cao 56px + đệm) trên điện thoại */}
            <Skeleton className="h-16 flex-1 rounded-xl sm:h-[3.25rem]" />
          </li>
        ))}
      </ul>
    </Loading>
  );
}

export function TeacherDailyReportSkeleton() {
  return (
    <Loading className="space-y-4">
      <Skeleton className="h-7 w-36" />
      <ClassDatePickerSkeleton />
      <div className="md:grid md:grid-cols-[18rem_1fr] md:gap-6">
        <div className="space-y-3">
          <Skeleton className="h-16 rounded-2xl" />
          <ListRowsSkeleton rows={8} />
        </div>
        <Skeleton className="hidden h-96 rounded-2xl md:block" />
      </div>
    </Loading>
  );
}

// ----------------------------------------------------------------------------- Quản trị

export function AdminDashboardSkeleton() {
  return (
    <Loading>
      <Skeleton className="h-8 w-40" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
    </Loading>
  );
}

/** Trang quản trị dạng "form tạo mới + danh sách" (Lớp học, Học sinh, Học phí). */
export function AdminManageSkeleton() {
  return (
    <Loading className="space-y-5">
      <Skeleton className="h-7 w-36" />
      <div className="space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
        <Skeleton className="h-5 w-40" />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-11 rounded-xl" />
            </div>
          ))}
        </div>
        <Skeleton className="h-11 w-36 rounded-xl" />
      </div>
      <Skeleton className="h-6 w-44" />
      <ListRowsSkeleton rows={6} trailing />
    </Loading>
  );
}

// ----------------------------------------------------------------------------- Tuyển sinh

/** Nội dung dưới tiêu đề + tab (layout tuyển sinh giữ nguyên khi tải). */
export function AdmissionsBoardSkeleton() {
  return (
    <Loading className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-7 w-10" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-11 min-w-0 flex-1 basis-56 rounded-xl" />
        <Skeleton className="h-11 flex-1 basis-36 rounded-xl" />
        <Skeleton className="h-11 flex-1 basis-36 rounded-xl" />
        <Skeleton className="h-11 w-44 rounded-xl" />
        <Skeleton className="h-11 w-36 rounded-xl" />
      </div>
      <div className="-mx-4 flex gap-3 overflow-hidden px-4 lg:mx-0 lg:grid lg:grid-cols-5 lg:px-0">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="w-[82%] shrink-0 space-y-2 rounded-2xl bg-muted/50 p-2 sm:w-72 lg:w-auto">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-20" />
            {Array.from({ length: 3 - (i % 2) }, (_, j) => (
              <Skeleton key={j} className="h-28 rounded-2xl bg-card" />
            ))}
          </div>
        ))}
      </div>
    </Loading>
  );
}

export function TrialsSkeleton() {
  return (
    <Loading className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-11 w-44 rounded-xl" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-6 w-36" />
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
              <div className="flex justify-between gap-2">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-52" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <Skeleton className="h-24 rounded-xl" />
              <div className="flex gap-2">
                <Skeleton className="h-9 w-24 rounded-lg" />
                <Skeleton className="h-9 w-20 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Loading>
  );
}

export function TeacherTrialsSkeleton() {
  return (
    <Loading className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-6 w-44" />
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-52" />
              <Skeleton className="h-3 w-56" />
              <Skeleton className="h-11 w-40 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </Loading>
  );
}

// ----------------------------------------------------------------------------- Lịch dạy & lương

export function TeacherScheduleSkeleton() {
  return (
    <Loading className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-36" />
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-12 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="h-[4.75rem] rounded-2xl" />
      <div className="flex justify-between gap-2">
        <Skeleton className="h-10 w-56 rounded-xl" />
        <Skeleton className="h-10 w-36 rounded-xl" />
      </div>
      <div className="grid gap-2 lg:grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    </Loading>
  );
}

export function PayrollSkeleton() {
  return (
    <Loading className="space-y-5">
      <div className="flex flex-wrap justify-between gap-2">
        <Skeleton className="h-10 w-56 rounded-xl" />
        <Skeleton className="h-10 w-64 rounded-xl" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-28" />
          </div>
        ))}
      </div>
      <ListRowsSkeleton rows={6} trailing />
    </Loading>
  );
}
