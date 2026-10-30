"use client";

import { useEffect, useMemo, useState } from "react";
import { Field, FormMessage, SubmitButton, fieldClass, useFormAction } from "@/components/shared/form-field";
import { CAMPUS_LABELS, SUBJECTS } from "@/config/constants";
import { cn } from "@/lib/utils";
import type { Enums } from "@/types/database.types";
import { bookTrial, rescheduleTrial } from "../actions";
import { PROGRAM_KEYS, TRIAL_TEXT_MAX } from "../constants";

export type ClassOption = {
  id: string;
  campus: Enums<"campus">;
  name: string;
  teachers: { id: string; full_name: string }[];
  campusTeachers: { id: string; full_name: string }[];
};
export type TeacherOption = {
  id: string;
  full_name: string;
  campus: Enums<"campus"> | null;
};
export type LeadOption = {
  id: string;
  full_name: string;
  parent_name: string;
  campus: Enums<"campus">;
  target_program: string;
};

type ExistingTrial = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  campus: Enums<"campus">;
  program: string;
  class_id: string | null;
  teacher_id: string | null;
  note_for_teacher: string | null;
};

const localFmt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
/** ISO → giá trị ô datetime-local theo giờ Việt Nam ("2026-11-02T14:30"). */
const toLocalInput = (iso: string) => localFmt.format(new Date(iso)).replace(" ", "T");

/**
 * Xếp lịch học thử (mới) hoặc sửa lịch đã xếp. Chọn cơ sở → lọc lớp; chọn lớp → gợi ý cô phụ trách lớp đó.
 * `lead` cố định (mở từ thẻ học sinh) hoặc chọn trong danh sách `leads`.
 */
export function TrialForm({
  lead,
  leads,
  trial,
  classes,
  teachers,
  onDone,
}: {
  lead?: LeadOption;
  leads?: LeadOption[];
  trial?: ExistingTrial;
  classes: ClassOption[];
  teachers: TeacherOption[];
  onDone?: () => void;
}) {
  const { state, pending, formRef, onSubmit, errors } = useFormAction(trial ? rescheduleTrial : bookTrial);
  const [leadId, setLeadId] = useState(lead?.id ?? "");
  const picked = lead ?? leads?.find((l) => l.id === leadId);
  const [campus, setCampus] = useState<Enums<"campus">>(trial?.campus ?? picked?.campus ?? "CS1_XALA");
  const [program, setProgram] = useState(trial?.program ?? picked?.target_program ?? PROGRAM_KEYS[0]!);
  const [classId, setClassId] = useState(trial?.class_id ?? "");
  const [teacherId, setTeacherId] = useState(trial?.teacher_id ?? "");

  useEffect(() => {
    if (state.ok && state.at) onDone?.();
  }, [state.ok, state.at, onDone]);

  // Đổi bé (form chung) → lấy cơ sở + chương trình bé quan tâm
  const pickLead = (id: string) => {
    setLeadId(id);
    const l = leads?.find((x) => x.id === id);
    if (l) {
      setCampus(l.campus);
      setProgram(l.target_program);
      setClassId("");
    }
  };

  const campusClasses = classes.filter((c) => c.campus === campus);
  const selectedClass = campusClasses.find((c) => c.id === classId);
  const suggested = useMemo(() => new Set((selectedClass?.teachers ?? []).map((t) => t.id)), [selectedClass]);
  const campusTeachers = teachers
    .filter((t) => t.campus === null || t.campus === campus)
    .sort((a, b) => Number(suggested.has(b.id)) - Number(suggested.has(a.id)));

  const pickClass = (id: string) => {
    setClassId(id);
    const cls = classes.find((c) => c.id === id);
    const first = cls?.teachers[0] ?? cls?.campusTeachers[0];
    if (first && !teacherId) setTeacherId(first.id);
  };

  const err = (k: string) => errors[k];

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4" noValidate>
      {trial && <input type="hidden" name="id" value={trial.id} />}
      {lead || trial ? (
        <input type="hidden" name="leadId" value={lead?.id ?? ""} />
      ) : (
        <Field label="Bé học thử *" htmlFor="trial-leadId" error={err("leadId")}>
          <select
            id="trial-leadId"
            name="leadId"
            value={leadId}
            onChange={(e) => pickLead(e.target.value)}
            className={fieldClass}
            aria-invalid={!!err("leadId")}
          >
            <option value="">— Chọn học sinh tiềm năng —</option>
            {leads?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.full_name} · PH {l.parent_name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <Field label="Ngày giờ học thử *" htmlFor="trial-scheduledAt" error={err("scheduledAt")}>
          <input
            id="trial-scheduledAt"
            name="scheduledAt"
            type="datetime-local"
            step={300}
            defaultValue={trial ? toLocalInput(trial.scheduled_at) : ""}
            className={fieldClass}
            aria-invalid={!!err("scheduledAt")}
          />
        </Field>
        <Field label="Thời lượng (phút)" htmlFor="trial-duration" error={err("durationMinutes")}>
          <input
            id="trial-duration"
            name="durationMinutes"
            type="number"
            min={15}
            max={240}
            step={15}
            defaultValue={trial?.duration_minutes ?? 60}
            className={fieldClass}
          />
        </Field>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-xs font-semibold text-muted-foreground">Chương trình học thử *</legend>
        <div className="grid grid-cols-3 gap-2">
          {PROGRAM_KEYS.map((key) => (
            <label
              key={key}
              className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl bg-card px-2 py-2 text-center text-sm font-semibold leading-tight ring-1 ring-border transition-colors has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:checked]:ring-primary has-[:focus-visible]:ring-2"
            >
              <input type="radio" name="program" value={key} checked={program === key} onChange={() => setProgram(key)} className="sr-only" />
              {SUBJECTS[key]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Cơ sở *" htmlFor="trial-campus" error={err("campus")}>
          <select
            id="trial-campus"
            name="campus"
            value={campus}
            onChange={(e) => {
              setCampus(e.target.value as Enums<"campus">);
              setClassId("");
            }}
            className={fieldClass}
          >
            {Object.entries(CAMPUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Học cùng lớp" htmlFor="trial-classId" error={err("classId")}>
          <select id="trial-classId" name="classId" value={classId} onChange={(e) => pickClass(e.target.value)} className={fieldClass}>
            <option value="">— Chưa chọn lớp —</option>
            {campusClasses.map((c) => (
              <option key={c.id} value={c.id}>
                Lớp {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Giáo viên đánh giá" htmlFor="trial-teacherId" error={err("teacherId")} hint="Cô nhận thông báo lịch học thử">
          <select id="trial-teacherId" name="teacherId" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={fieldClass}>
            <option value="">— Chưa phân công —</option>
            {campusTeachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
                {suggested.has(t.id) ? " (cô của lớp)" : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label="Ghi chú cho giáo viên"
        htmlFor="trial-note"
        error={err("noteForTeacher")}
        hint="Giáo viên chỉ thấy ghi chú này (không thấy SĐT, ghi chú tư vấn)"
      >
        <textarea
          id="trial-note"
          name="noteForTeacher"
          rows={2}
          maxLength={TRIAL_TEXT_MAX}
          defaultValue={trial?.note_for_teacher ?? ""}
          placeholder="Vd: bé hơi nhút nhát, phụ huynh muốn biết bé cầm bút đúng chưa"
          className={cn(fieldClass, "h-auto resize-y py-2.5")}
        />
      </Field>

      {!trial && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-emerald-50 p-3 text-sm ring-1 ring-emerald-200">
          <input type="checkbox" name="sendConfirmation" defaultChecked className="mt-0.5 size-5 shrink-0 accent-emerald-600" />
          <span>
            <span className="block font-semibold text-emerald-900">Gửi tin xác nhận lịch hẹn cho phụ huynh</span>
            <span className="block text-xs text-emerald-800">Tự động qua Zalo ZNS / SMS nếu đã kết nối; nếu chưa, bạn sao chép tin nhắn có sẵn để gửi.</span>
          </span>
        </label>
      )}

      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingText="Đang lưu..." className="w-full sm:w-auto">
        {trial ? "Lưu lịch học thử" : "Xếp lịch học thử"}
      </SubmitButton>
    </form>
  );
}
