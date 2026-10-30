import type { Metadata } from "next";
import { CircleCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ATTENDANCE_STYLE, FEE_STATUS_STYLE, SUBJECT_STYLE } from "@/config/ui-styles";
import { SUBJECTS, type SubjectKey } from "@/config/constants";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Design System" };

/** Màu thương hiệu + tương phản WCAG đã kiểm (chữ trên nền). */
const BRAND = [
  { name: "Edu Blue", token: "primary · edu-blue", hex: "#1E4FB0", swatch: "bg-edu-blue", text: "text-white", note: "Uy tín, tri thức — nút chính, liên kết, tab đang chọn", contrast: "7.5:1 chữ trắng" },
  { name: "Edu Navy", token: "edu-navy", hex: "#0F1E46", swatch: "bg-edu-navy", text: "text-white", note: "Header khu quản trị", contrast: "16.2:1 chữ trắng" },
  { name: "Xanh lá non", token: "edu-leaf", hex: "#84CC16 / #ECFCCB", swatch: "bg-edu-leaf-100", text: "text-edu-leaf-800", note: "Sự phát triển của trẻ — Tiền tiểu học, tỉ lệ chuyên cần", contrast: "8.1:1 chữ leaf-800" },
  { name: "Cam pastel", token: "edu-peach", hex: "#F97316 / #FFEDD5", swatch: "bg-edu-peach-100", text: "text-edu-peach-800", note: "Năng động — Toán tư duy, học phí", contrast: "6.4:1 chữ peach-800" },
  { name: "Nền", token: "background", hex: "#F8FAFC", swatch: "bg-background ring-1 ring-border", text: "text-foreground", note: "Xám siêu nhạt, không chói khi xem buổi tối", contrast: "17:1 chữ chính" },
  { name: "Chữ phụ", token: "muted-foreground", hex: "#475569", swatch: "bg-muted-foreground", text: "text-white", note: "Ngày giờ, chú thích", contrast: "7.6:1 trên thẻ trắng" },
];

const TYPE = [
  { cls: "text-2xl font-extrabold tracking-tight", label: "2xl · 24px · ExtraBold", sample: "Trần Minh An", use: "Tên bé trên thẻ học sinh" },
  { cls: "text-xl font-extrabold", label: "xl · 20px · ExtraBold", sample: "Chuyên cần của con", use: "Tiêu đề trang" },
  { cls: "text-base font-bold", label: "base · 16px · Bold", sample: "Nhật ký bài học", use: "Tiêu đề khối, tên môn" },
  { cls: "text-base font-medium leading-relaxed", label: "base · 16px · Medium", sample: "Hôm nay An rất hăng hái phát biểu.", use: "Nhận xét quan trọng của cô" },
  { cls: "text-sm", label: "sm · 15px · Regular", sample: "Nét chữ đều hơn, cần giữ tư thế ngồi.", use: "Nội dung phụ" },
  { cls: "text-xs font-semibold text-muted-foreground", label: "xs · 14px · SemiBold", sample: "Thứ Ba, 27/10 · 18:00", use: "Ngày tháng, chú thích — cỡ nhỏ nhất" },
];

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-bold">{title}</h2>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-extrabold">Design System TH EDU</h1>
        <p className="text-sm text-muted-foreground">
          Nguồn: <code>globals.css</code> (token), <code>tailwind.config.ts</code> (màu edu, thang chữ, bóng đổ), <code>config/ui-styles.ts</code> (trạng thái).
          Trang này dựng trực tiếp từ các token đó — đổi token là trang tự cập nhật.
        </p>
      </div>

      <Block title="Bảng màu thương hiệu">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BRAND.map((c) => (
            <div key={c.name} className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
              <div className={cn("flex h-20 items-end p-3 font-bold", c.swatch, c.text)}>{c.name}</div>
              <div className="space-y-0.5 p-3 text-xs">
                <p className="font-mono font-semibold">
                  {c.hex} · {c.token}
                </p>
                <p className="text-muted-foreground">{c.note}</p>
                <p className="font-semibold text-green-800">Tương phản {c.contrast} ✓</p>
              </div>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Màu trạng thái (chữ đậm trên nền pastel, ≥ 6:1)">
        <div className="flex flex-wrap gap-2">
          {(["present", "late", "absent", "absent_with_permission", "none"] as const).map((k) => {
            const s = ATTENDANCE_STYLE[k];
            return (
              <span key={k} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1", s.badge)}>
                <s.icon className="size-4" /> {s.label}
              </span>
            );
          })}
          {(Object.keys(FEE_STATUS_STYLE) as (keyof typeof FEE_STATUS_STYLE)[]).map((k) => (
            <span key={k} className={cn("rounded-full px-3 py-1 text-xs font-bold ring-1", FEE_STATUS_STYLE[k].badge)}>
              Học phí: {FEE_STATUS_STYLE[k].label}
            </span>
          ))}
        </div>
        <div className="grid max-w-xs grid-cols-5 gap-1">
          {(["present", "late", "absent", "absent_with_permission", "none"] as const).map((k, i) => (
            <span key={k} className={cn("flex aspect-square items-center justify-center rounded-xl text-sm font-bold", ATTENDANCE_STYLE[k].cell)}>
              {i + 1}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(SUBJECTS) as SubjectKey[]).map((k) => {
            const s = SUBJECT_STYLE[k];
            return (
              <span key={k} className="flex items-center gap-2 rounded-2xl bg-card p-2 pr-3 text-sm font-semibold shadow-sm ring-1 ring-border">
                <span className={cn("flex size-9 items-center justify-center rounded-xl", s.bubble)}>
                  <s.icon className="size-5" />
                </span>
                {SUBJECTS[k]}
              </span>
            );
          })}
        </div>
      </Block>

      <Block title="Chữ — Plus Jakarta Sans, nhỏ nhất 14px">
        <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
          {TYPE.map((t) => (
            <li key={t.label} className="grid gap-1 p-3 sm:grid-cols-[14rem_1fr]">
              <span className="text-xs font-semibold text-muted-foreground">
                {t.label}
                <span className="block font-normal">{t.use}</span>
              </span>
              <span className={t.cls}>{t.sample}</span>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Thẻ, bóng đổ & điểm nhấn">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
            <p className="font-bold">Thẻ chuẩn</p>
            <p className="text-xs text-muted-foreground">rounded-2xl · shadow-sm · ring-border</p>
          </div>
          <div className="rounded-2xl bg-card p-4 shadow-md ring-1 ring-border">
            <p className="font-bold">Thẻ nổi bật</p>
            <p className="text-xs text-muted-foreground">shadow-md — bóng mềm ánh xanh</p>
          </div>
          <div className="rounded-2xl bg-green-50 p-4 text-green-800 shadow-neu ring-1 ring-green-200">
            <p className="flex items-center gap-1.5 font-bold">
              <CircleCheck className="size-5" /> Neumorphic
            </p>
            <p className="text-xs">shadow-neu — ô số liệu, điểm danh</p>
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-edu-blue-500 via-edu-blue to-edu-blue-800 p-4 text-white shadow-lg shadow-edu-blue/25 sm:col-span-2">
            <div aria-hidden className="absolute -bottom-10 right-4 size-28 rounded-full bg-edu-peach-300/40 blur-2xl" />
            <p className="relative flex items-center gap-1.5 font-bold">
              <Sparkles className="size-5" /> Thẻ thương hiệu
            </p>
            <p className="relative text-xs text-white/85">Gradient Edu Blue + quầng sáng cam / xanh lá non</p>
            <span className="relative mt-2 inline-flex rounded-full bg-white/20 px-3 py-1 text-xs font-semibold ring-1 ring-white/25 backdrop-blur-sm">
              Kính mờ (glass)
            </span>
          </div>
          <div className="space-y-2 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <p className="text-xs text-muted-foreground">Skeleton + shimmer</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button>Nút chính</Button>
          <Button variant="outline">Nút phụ</Button>
          <Button variant="ghost">Nút nhẹ</Button>
          <Button variant="destructive">Xoá</Button>
        </div>
      </Block>
    </div>
  );
}
