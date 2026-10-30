"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, CircleAlert, CircleCheck, Images, Loader2, MessageSquareText, Save, Smile, Star, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { SUBJECTS, SUBJECT_CRITERIA, type SubjectKey, isAbsence } from "@/config/constants";
import { ATTENDANCE_STYLE, MOOD_STYLE, SUBJECT_STYLE } from "@/config/ui-styles";
import { cn, givenName } from "@/lib/utils";
import { setUnsavedChanges } from "@/lib/unsaved-changes";
import { saveDailyReport } from "@/features/daily-reports/actions";
import { MOODS, dailyReportFormSchema, type DailyReportFormValues } from "@/features/daily-reports/schema";
import type { Enums } from "@/types/database.types";
import { MediaUploader } from "./media-uploader";
import { toast } from "@/components/ui/toast";

// Câu mẫu chạm-để-chèn — tiết kiệm thời gian gõ trên điện thoại
const QUICK_SUBJECT: Record<SubjectKey, string[]> = {
  tien_tieu_hoc: ["Con đọc tốt các chữ cái hôm nay", "Con cần luyện thêm phần ghép vần", "Con tự tin kể chuyện"],
  luyen_chu: ["Con ngồi đúng tư thế, chữ đều nét", "Con cần luyện thêm nét cong", "Con tô chữ cẩn thận"],
  toan_tu_duy: ["Con hoàn thành tốt bài tập", "Con cần thêm thời gian cho bài tư duy", "Con tìm quy luật rất nhanh"],
};
const QUICK_NOTE = [
  "Hôm nay con rất ngoan và hăng hái phát biểu!",
  "Con ăn hết suất và ngủ trưa ngoan.",
  "Bố mẹ nhắc con mang theo bình nước cá nhân nhé.",
];

function appendSentence(current: string, sentence: string) {
  const trimmed = current.trim();
  if (!trimmed) return sentence;
  return /[.!?…]$/.test(trimmed) ? `${trimmed} ${sentence}` : `${trimmed}. ${sentence}`;
}

function StarRating({
  value,
  onChange,
  label,
  compact = false,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
  /** Sao nhỏ hơn — dùng cho tiêu chí chi tiết */
  compact?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={`Đánh giá ${label}`} className="flex items-center">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} sao`}
          // Chạm lại đúng số sao đang chọn → bỏ đánh giá
          onClick={() => onChange(value === n ? null : n)}
          className={cn("flex items-center justify-center rounded-lg active:scale-90", compact ? "size-8" : "size-9")}
        >
          <Star
            className={cn(
              "transition-colors",
              compact ? "size-[18px]" : "size-6",
              value !== null && n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300",
            )}
          />
        </button>
      ))}
    </div>
  );
}

function QuickChips({ options, onPick }: { options: string[]; onPick: (s: string) => void }) {
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onPick(o)}
          className="shrink-0 rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground active:bg-accent"
        >
          + {o}
        </button>
      ))}
    </div>
  );
}

/** Bộ đếm ký tự nằm ở góc dưới-phải bên trong ô nhập (cha phải `relative`). */
function Counter({ value, max }: { value: string; max: number }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute bottom-1.5 right-3 text-xs tabular-nums",
        value.length > max ? "font-bold text-destructive" : "text-muted-foreground",
      )}
    >
      {value.length}/{max}
    </span>
  );
}

function Card({ title, icon: Icon, children, className }: { title: string; icon: typeof Smile; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border", className)}>
      <h3 className="flex items-center gap-2 font-bold">
        <Icon className="size-4 text-primary" /> {title}
      </h3>
      {children}
    </section>
  );
}

function firstError(errors: FieldErrors<DailyReportFormValues>): string | undefined {
  const subjectError = Object.values(errors.subjects ?? {}).find(Boolean) as { comment?: { message?: string } } | undefined;
  return errors.teacherNote?.message ?? errors.media?.message ?? subjectError?.comment?.message ?? errors.date?.message ?? errors.root?.message;
}

export function DailyReportForm({
  student,
  attendanceStatus,
  defaults,
  existingMedia,
  isExisting,
  classmatesCount,
  backHref,
  nextHref,
}: {
  student: { id: string; full_name: string; avatar_url: string | null };
  attendanceStatus: Enums<"attendance_status"> | null;
  defaults: DailyReportFormValues;
  existingMedia: { path: string; url: string; type: "image" | "video" }[];
  isExisting: boolean;
  /** Số bạn khác trong lớp (không tính bạn vắng) — cho tuỳ chọn áp dụng cả lớp */
  classmatesCount: number;
  backHref: string;
  nextHref: string | null;
}) {
  const router = useRouter();
  const intent = useRef<"stay" | "next">("stay");
  const [uploading, setUploading] = useState(false);
  const [savedVersion, setSavedVersion] = useState(0);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { control, register, handleSubmit, setValue, getValues, reset, formState } = useForm<DailyReportFormValues>({
    resolver: zodResolver(dailyReportFormSchema),
    defaultValues: defaults,
    mode: "onTouched",
  });
  const [teacherNote, applyNoteToClass, subjects] = useWatch({ control, name: ["teacherNote", "applyNoteToClass", "subjects"] });

  useEffect(() => {
    setUnsavedChanges(formState.isDirty);
    if (!formState.isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [formState.isDirty]);
  useEffect(() => () => setUnsavedChanges(false), []);

  const onMediaChange = useCallback(
    (paths: string[]) => setValue("media", paths, { shouldDirty: true, shouldValidate: formState.isSubmitted }),
    [setValue, formState.isSubmitted],
  );

  const onSubmit = handleSubmit(
    async (values) => {
      setMessage(null);
      try {
        const res = await saveDailyReport(values);
        if (!res.ok) {
          setMessage({ type: "error", text: res.error });
          toast.error("Chưa lưu được sổ liên lạc", res.error);
          return;
        }
        reset(values);
        setUnsavedChanges(false);
        setSavedVersion((v) => v + 1);

        const { appliedTo, skippedAbsent, skippedHasNote } = res.data;
        const parts = [`Đã lưu sổ liên lạc của ${givenName(student.full_name)}.`];
        if (values.applyNoteToClass) {
          parts.push(
            appliedTo > 0 ? `Đã áp dụng nhận xét chung cho ${appliedTo} bạn.` : "Không có bạn nào cần áp dụng nhận xét chung.",
          );
          if (skippedHasNote) parts.push(`Giữ nguyên ${skippedHasNote} bạn đã có nhận xét.`);
          if (skippedAbsent) parts.push(`Bỏ qua ${skippedAbsent} bạn vắng.`);
          setValue("applyNoteToClass", false);
        }
        setMessage({ type: "success", text: parts.join(" ") });
        toast.success(`Đã lưu sổ liên lạc của ${givenName(student.full_name)} 📒`, parts.slice(1).join(" ") || "Phụ huynh nhận thông báo ngay.");

        if (intent.current === "next" && nextHref) router.push(nextHref);
        else router.refresh();
      } catch (err) {
        console.error(err);
        setMessage({ type: "error", text: "Không thể kết nối máy chủ. Vui lòng thử lại." });
      }
    },
    // Lỗi validate không lưu vào `message`: banner bên dưới đọc trực tiếp formState.errors,
    // nên tự biến mất khi người dùng sửa xong (reValidateMode mặc định = onChange).
    () => setMessage(null),
  );
  const validationError =
    formState.isSubmitted && Object.keys(formState.errors).length > 0
      ? (firstError(formState.errors) ?? "Vui lòng kiểm tra lại các ô được đánh dấu.")
      : null;
  const banner = message ?? (validationError ? { type: "error" as const, text: validationError } : null);

  const att = attendanceStatus ? ATTENDANCE_STYLE[attendanceStatus] : ATTENDANCE_STYLE.none;
  const AttIcon = att.icon;
  const submitting = formState.isSubmitting;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {/* Đầu form: học sinh */}
      <div className="flex items-center gap-3">
        <Link href={backHref} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card ring-1 ring-border md:hidden" aria-label="Về danh sách lớp">
          <ArrowLeft className="size-5" />
        </Link>
        <StudentAvatar student={student} className="size-12 text-lg" />
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-lg font-extrabold">{student.full_name}</h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="soft" className={att.badge}>
              <AttIcon /> {att.label}
            </Badge>
            <span className="text-xs text-muted-foreground">{isExisting ? "Đang sửa sổ đã gửi" : "Sổ mới"}</span>
          </div>
        </div>
      </div>

      {isAbsence(attendanceStatus) && (
        <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          Bé được điểm danh {attendanceStatus === "absent_with_permission" ? "nghỉ có phép" : "vắng"} ngày này. Bạn vẫn có thể ghi sổ nếu cần.
        </p>
      )}

      {/* Tâm trạng */}
      <Card title="Tâm trạng hôm nay" icon={Smile}>
        <Controller
          control={control}
          name="mood"
          render={({ field }) => (
            <div role="radiogroup" aria-label="Tâm trạng" className="grid grid-cols-4 gap-2">
              {MOODS.map((m) => {
                const style = MOOD_STYLE[m];
                const checked = field.value === m;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    onClick={() => field.onChange(checked ? null : m)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl py-2.5 ring-1 transition-all active:scale-95",
                      checked ? cn(style.card, "ring-2 ring-primary") : "bg-background ring-border",
                    )}
                  >
                    <span className={cn("text-3xl leading-none transition-transform", checked && "scale-110")} aria-hidden>
                      {style.emoji}
                    </span>
                    <span className="px-1 text-center text-xs font-semibold leading-tight">{style.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        />
      </Card>

      {/* Đánh giá các môn */}
      <Card title="Đánh giá các môn" icon={Star}>
        <div className="divide-y">
          {(Object.keys(SUBJECTS) as SubjectKey[]).map((key) => {
            const { icon: Icon, bubble } = SUBJECT_STYLE[key];
            const err = formState.errors.subjects?.[key]?.comment?.message;
            const comment = subjects?.[key]?.comment ?? "";
            return (
              <div key={key} className="space-y-2 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-semibold">
                    <span className={cn("flex size-8 items-center justify-center rounded-lg", bubble)}>
                      <Icon className="size-4" />
                    </span>
                    {SUBJECTS[key]}
                  </span>
                  <Controller
                    control={control}
                    name={`subjects.${key}.rating`}
                    render={({ field }) => <StarRating value={field.value} onChange={field.onChange} label={SUBJECTS[key]} />}
                  />
                </div>
                {/* Tiêu chí chi tiết (không bắt buộc) — dữ liệu cho biểu đồ tiến bộ */}
                <div className="space-y-0.5 rounded-xl bg-muted/50 px-2.5 py-1.5">
                  {Object.entries(SUBJECT_CRITERIA[key]).map(([ck, label]) => (
                    <div key={ck} className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">{label}</span>
                      <Controller
                        control={control}
                        name={`subjects.${key}.criteria.${ck}`}
                        render={({ field }) => (
                          <StarRating value={field.value ?? null} onChange={field.onChange} label={`${SUBJECTS[key]} — ${label}`} compact />
                        )}
                      />
                    </div>
                  ))}
                </div>
                <div className="relative">
                  <Textarea
                    {...register(`subjects.${key}.comment`)}
                    rows={2}
                    placeholder={`Nhận xét ngắn về ${SUBJECTS[key]}...`}
                    aria-invalid={!!err}
                    className={cn("rounded-xl pb-6", err && "border-destructive")}
                  />
                  <Counter value={comment} max={500} />
                </div>
                <QuickChips
                  options={QUICK_SUBJECT[key]}
                  onPick={(s) =>
                    setValue(`subjects.${key}.comment`, appendSentence(getValues(`subjects.${key}.comment`), s), {
                      shouldDirty: true,
                      shouldValidate: formState.isSubmitted,
                    })
                  }
                />
                {err && <p className="text-xs text-destructive">{err}</p>}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Nhận xét chung */}
      <Card title="Nhận xét chung của giáo viên" icon={MessageSquareText}>
        <div className="relative">
          <Textarea
            {...register("teacherNote")}
            rows={4}
            placeholder="Một ngày của con ở lớp: hoạt động, ăn ngủ, lời nhắn cho gia đình..."
            aria-invalid={!!formState.errors.teacherNote}
            className={cn("rounded-xl pb-6", formState.errors.teacherNote && "border-destructive")}
          />
          <Counter value={teacherNote ?? ""} max={2000} />
        </div>
        <QuickChips
          options={QUICK_NOTE}
          onPick={(s) =>
            setValue("teacherNote", appendSentence(getValues("teacherNote"), s), {
              shouldDirty: true,
              shouldValidate: formState.isSubmitted,
            })
          }
        />
        {formState.errors.teacherNote && <p className="text-sm text-destructive">{formState.errors.teacherNote.message}</p>}

        {classmatesCount > 0 && (
          <label
            className={cn(
              "flex cursor-pointer gap-3 rounded-xl p-3 ring-1 transition-colors",
              applyNoteToClass ? "bg-primary/10 ring-primary" : "bg-muted/50 ring-border",
            )}
          >
            <input type="checkbox" {...register("applyNoteToClass")} className="mt-0.5 size-5 shrink-0 accent-[hsl(var(--primary))]" />
            <span className="text-sm">
              <span className="flex items-center gap-1.5 font-semibold">
                <Users className="size-4" /> Áp dụng nhận xét chung cho cả lớp
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Ghi nội dung trên vào sổ của tối đa {classmatesCount} bạn có đi học ngày này. Bạn nào đã có nhận xét chung sẽ được giữ
                nguyên. Tâm trạng, đánh giá môn và ảnh chỉ lưu cho {givenName(student.full_name)}.
              </span>
            </span>
          </label>
        )}
      </Card>

      {/* Ảnh & video */}
      <Card title="Ảnh & video hoạt động" icon={Images}>
        <Controller
          control={control}
          name="media"
          render={({ field }) => (
            <MediaUploader
              studentId={defaults.studentId}
              date={defaults.date}
              value={field.value}
              onChange={onMediaChange}
              onBusyChange={setUploading}
              existing={existingMedia}
              savedVersion={savedVersion}
            />
          )}
        />
        {formState.errors.media?.message && <p className="text-sm text-destructive">{formState.errors.media.message}</p>}
      </Card>

      {/* Thanh lưu dính đáy */}
      <div className="sticky bottom-[calc(var(--bottom-nav,4.5rem)+env(safe-area-inset-bottom))] z-20 space-y-2 md:bottom-4">
        {banner && (
          <p
            role={banner.type === "error" ? "alert" : "status"}
            className={cn(
              "flex items-start gap-2 rounded-xl p-3 text-sm font-medium shadow-lg",
              banner.type === "success" ? "bg-emerald-600 text-white" : "bg-destructive text-destructive-foreground",
            )}
          >
            {banner.type === "success" ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
            {banner.text}
          </p>
        )}
        <div className={cn("grid gap-2", nextHref && "grid-cols-2")}>
          <Button
            type="submit"
            variant={nextHref ? "outline" : "default"}
            size="lg"
            className={cn("h-12 rounded-xl text-base shadow-lg", nextHref && "bg-card")}
            disabled={submitting || uploading}
            onClick={() => (intent.current = "stay")}
          >
            {submitting && intent.current === "stay" ? <Loader2 className="animate-spin" /> : <Save />}
            {uploading ? "Đang tải ảnh..." : "Lưu"}
          </Button>
          {nextHref && (
            <Button
              type="submit"
              size="lg"
              className="h-12 rounded-xl text-base shadow-lg"
              disabled={submitting || uploading}
              onClick={() => (intent.current = "next")}
            >
              {submitting && intent.current === "next" ? <Loader2 className="animate-spin" /> : null}
              Lưu & bạn tiếp <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
