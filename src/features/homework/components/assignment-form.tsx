"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookPlus, CalendarClock, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormMessage, SubmitButton, fieldClass, useFormAction } from "@/components/shared/form-field";
import { SUBJECTS } from "@/config/constants";
import { dayMonth, weekdayShort } from "@/lib/date";
import { isSubjectKey } from "@/lib/subjects";
import { cn } from "@/lib/utils";
import { createAssignment, deleteAssignment } from "../actions";
import { SUBMISSION_TYPES } from "../constants";
import type { ClassAssignmentRow } from "../queries";
import { confirmSheet } from "@/components/ui/confirm-sheet";

const EXAMPLES = ["Video bé đọc bảng chữ cái", "Ảnh bài luyện chữ trang 5", "Video bé đếm từ 1 đến 20"];

export function AssignmentForm({ classKey, className, today }: { classKey: string; className: string; today: string }) {
  const { state, pending, formRef, onSubmit, errors } = useFormAction(createAssignment);
  const [title, setTitle] = useState("");

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border" onReset={() => setTitle("")}>
      <h2 className="flex items-center gap-2 font-bold">
        <BookPlus className="size-5 text-primary" /> Giao bài cho lớp {className}
      </h2>
      <input type="hidden" name="classKey" value={classKey} />

      <Field label="Tên bài tập" htmlFor="hw-title" error={errors.title}>
        <Input id="hw-title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required className={fieldClass} aria-invalid={!!errors.title} placeholder="VD: Video bé đọc bảng chữ cái" />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" onClick={() => setTitle(ex)} className="rounded-full bg-muted px-2.5 py-1 text-xs hover:bg-muted/70">
            {ex}
          </button>
        ))}
      </div>

      <Field label="Hướng dẫn cho phụ huynh" htmlFor="hw-instructions" error={errors.instructions}>
        <Textarea id="hw-instructions" name="instructions" rows={3} maxLength={1500} className="rounded-xl text-base md:text-sm" placeholder="VD: Bố mẹ quay video bé đọc to từ A đến Z, khoảng 1 phút." />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Môn" htmlFor="hw-subject" error={errors.subject}>
          <select id="hw-subject" name="subject" className={fieldClass} defaultValue="">
            <option value="">Không ghi môn</option>
            {Object.entries(SUBJECTS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nộp bằng" htmlFor="hw-type" error={errors.submissionType}>
          <select id="hw-type" name="submissionType" className={fieldClass} defaultValue="any">
            {Object.entries(SUBMISSION_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Hạn nộp" htmlFor="hw-due" error={errors.dueDate}>
          <Input id="hw-due" name="dueDate" type="date" min={today} className={fieldClass} />
        </Field>
      </div>

      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingText="Đang giao bài..." className="w-full">
        Giao bài & báo phụ huynh
      </SubmitButton>
    </form>
  );
}

export function AssignmentList({ items, today }: { items: ClassAssignmentRow[]; today: string }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function remove(row: ClassAssignmentRow) {
    const extra = row.submitted ? ` ${row.submitted} bài nộp và số sao của bài này cũng sẽ bị xoá.` : "";
    if (!(await confirmSheet({ title: `Xoá bài "${row.title}"?`, description: extra.trim() || undefined, confirmLabel: "Xoá bài", tone: "danger" }))) return;
    setError(null);
    setPendingId(row.id);
    startTransition(async () => {
      const res = await deleteAssignment(row.id);
      setPendingId(null);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  if (items.length === 0) return <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">Lớp chưa có bài tập nào.</p>;

  return (
    <div className="space-y-2">
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
      <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
        {items.map((row) => (
          <li key={row.id} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="break-words font-semibold">{row.title}</p>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                {isSubjectKey(row.subject) && <span>{SUBJECTS[row.subject]}</span>}
                {row.due_date && (
                  <span className={cn("flex items-center gap-1", row.due_date < today && "text-amber-700")}>
                    <CalendarClock className="size-3" /> {weekdayShort(row.due_date)}, {dayMonth(row.due_date)}
                  </span>
                )}
                <span>
                  {row.submitted} đã nộp · {row.graded} đã chấm
                </span>
              </p>
            </div>
            <Button type="button" size="icon" variant="ghost" className="size-10 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => remove(row)} disabled={pendingId === row.id} aria-label={`Xoá bài ${row.title}`}>
              {pendingId === row.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
