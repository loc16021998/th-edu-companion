"use client";

import { useState } from "react";
import { EyeOff, PhoneCall, Send, ShieldCheck } from "lucide-react";
import { Field, FormMessage, SubmitButton, fieldClass, useFormAction } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";
import { submitFeedback } from "../actions";
import { FEEDBACK_CATEGORIES, FEEDBACK_KINDS, FEEDBACK_MAX, type FeedbackCategory, type FeedbackKind } from "../constants";

/** Góc góp ý & hỗ trợ: phụ huynh gửi góp ý / báo lỗi / thắc mắc tới Ban Giám đốc — đứng tên hoặc ẩn danh. */
export function FeedbackForm({ students, contact }: { students: { id: string; name: string }[]; contact: { name: string; phone: string } }) {
  const { state, pending, formRef, onSubmit, errors: err } = useFormAction(submitFeedback);
  const [kind, setKind] = useState<FeedbackKind>("gop_y");
  const [category, setCategory] = useState<FeedbackCategory>("chuong_trinh");
  const [anonymous, setAnonymous] = useState(false);
  const [length, setLength] = useState(0);

  const chip = (active: boolean) =>
    cn(
      "rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors",
      active ? "bg-primary text-primary-foreground ring-primary" : "bg-background text-muted-foreground ring-border",
    );

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      onReset={() => {
        setLength(0);
        setKind("gop_y");
        setCategory("chuong_trinh");
        setAnonymous(false);
      }}
      noValidate
      className="space-y-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border"
    >
      <h2 className="flex items-center gap-2 font-bold">
        <Send className="size-5 text-primary" /> Gửi tới Ban Giám đốc TH EDU
      </h2>

      {/* Loại */}
      <fieldset>
        <legend className="sr-only">Loại</legend>
        <input type="hidden" name="kind" value={kind} />
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
          {(Object.entries(FEEDBACK_KINDS) as [FeedbackKind, (typeof FEEDBACK_KINDS)[FeedbackKind]][]).map(([key, k]) => (
            <button
              key={key}
              type="button"
              aria-pressed={kind === key}
              onClick={() => setKind(key)}
              className={cn("whitespace-nowrap rounded-lg px-1 py-2 text-xs font-semibold sm:text-sm", kind === key ? "bg-card shadow-sm" : "text-muted-foreground")}
            >
              <span aria-hidden>{k.emoji}</span> {k.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{FEEDBACK_KINDS[kind].hint}</p>
      </fieldset>

      {/* Chủ đề */}
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-semibold text-muted-foreground">Chủ đề</legend>
        <input type="hidden" name="category" value={category} />
        <div className="flex flex-wrap gap-1.5">
          {(Object.entries(FEEDBACK_CATEGORIES) as [FeedbackCategory, string][]).map(([key, label]) => (
            <button key={key} type="button" aria-pressed={category === key} onClick={() => setCategory(key)} className={chip(category === key)}>
              {label}
            </button>
          ))}
        </div>
        {err.category && <p className="text-xs font-medium text-destructive">{err.category}</p>}
      </fieldset>

      {!anonymous && students.length > 1 && (
        <Field label="Về bé (không bắt buộc)" htmlFor="fb-student" error={err.studentId}>
          <select id="fb-student" name="studentId" className={fieldClass} defaultValue="">
            <option value="">— Chung, không riêng bé nào —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                Bé {s.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {!anonymous && students.length === 1 && <input type="hidden" name="studentId" value={students[0]?.id} />}

      <Field label="Nội dung" htmlFor="fb-content" error={err.content}>
        <div className="relative">
          <textarea
            id="fb-content"
            name="content"
            rows={5}
            maxLength={FEEDBACK_MAX}
            onChange={(e) => setLength(e.target.value.length)}
            placeholder={
              kind === "bao_loi"
                ? "Anh/chị mô tả lỗi gặp phải: ở trang nào, bấm gì thì bị lỗi..."
                : kind === "thac_mac"
                  ? "Anh/chị cần trung tâm giải đáp điều gì?"
                  : "Anh/chị chia sẻ góp ý để trung tâm phục vụ các con tốt hơn..."
            }
            aria-invalid={!!err.content}
            className={cn(fieldClass, "h-auto resize-y py-2.5 pb-6")}
          />
          <span className="pointer-events-none absolute bottom-2 right-3 text-xs tabular-nums text-muted-foreground">
            {length}/{FEEDBACK_MAX}
          </span>
        </div>
      </Field>

      {/* Ẩn danh / liên hệ */}
      <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl p-3 ring-1", anonymous ? "bg-violet-50 ring-violet-200" : "bg-muted/40 ring-border")}>
        <input type="checkbox" name="anonymous" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="mt-0.5 size-4 accent-violet-600" />
        <span className="text-sm">
          <span className="flex items-center gap-1.5 font-semibold">
            <EyeOff className="size-4" /> Gửi ẩn danh
          </span>
          <span className="block text-xs text-muted-foreground">
            Ban Giám đốc không thấy tên, số điện thoại hay tên bé. Anh/chị vẫn xem được trả lời tại trang này.
          </span>
        </span>
      </label>

      {!anonymous && (
        <div className="space-y-3 rounded-xl bg-muted/40 p-3 ring-1 ring-border">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <PhoneCall className="size-4" /> Thông tin liên hệ (để trung tâm liên lạc khi cần)
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Người liên hệ" htmlFor="fb-contact-name" error={err.contactName}>
              <input id="fb-contact-name" name="contactName" defaultValue={contact.name} maxLength={100} className={fieldClass} autoComplete="name" />
            </Field>
            <Field label="Số điện thoại" htmlFor="fb-contact-phone" error={err.contactPhone}>
              <input
                id="fb-contact-phone"
                name="contactPhone"
                type="tel"
                inputMode="tel"
                defaultValue={contact.phone}
                maxLength={20}
                className={fieldClass}
                autoComplete="tel"
                aria-invalid={!!err.contactPhone}
              />
            </Field>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" name="wantsCallback" className="size-4 accent-primary" /> Tôi muốn được trung tâm gọi điện lại
          </label>
        </div>
      )}

      <FormMessage state={state} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-emerald-600" /> Gửi thẳng tới Ban Giám đốc, giáo viên không xem được.
        </p>
        <SubmitButton pending={pending} pendingText="Đang gửi..." className="w-full sm:w-auto">
          <Send /> Gửi
        </SubmitButton>
      </div>
    </form>
  );
}
