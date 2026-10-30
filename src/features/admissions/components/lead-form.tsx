"use client";

import { useEffect } from "react";
import { Field, FormMessage, SubmitButton, fieldClass, useFormAction } from "@/components/shared/form-field";
import { CAMPUS_LABELS, SUBJECTS } from "@/config/constants";
import type { FormState } from "@/lib/form-state";
import { cn } from "@/lib/utils";
import { createLead, updateLead } from "../actions";
import { LEAD_NOTES_MAX, LEAD_SOURCES, PROGRAM_KEYS, localPhone } from "../constants";
import type { Lead } from "../queries";

export type PersonOption = { id: string; full_name: string };

/** Thêm mới / sửa thông tin học sinh tiềm năng. */
export function LeadForm({ lead, consultants, onDone }: { lead?: Lead; consultants: PersonOption[]; onDone?: () => void }) {
  const action = lead ? (prev: FormState, fd: FormData) => updateLead(lead.id, prev, fd) : createLead;
  const { state, pending, formRef, onSubmit, errors } = useFormAction(action);
  const err = (k: string) => errors[k];

  useEffect(() => {
    if (state.ok && state.at) onDone?.();
  }, [state.ok, state.at, onDone]);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Họ tên bé *" htmlFor="lead-fullName" error={err("fullName")}>
          <input id="lead-fullName" name="fullName" defaultValue={lead?.full_name} className={fieldClass} autoComplete="off" aria-invalid={!!err("fullName")} />
        </Field>
        <Field label="Ngày sinh" htmlFor="lead-dob" error={err("dob")}>
          <input id="lead-dob" name="dob" type="date" defaultValue={lead?.dob ?? ""} className={fieldClass} aria-invalid={!!err("dob")} />
        </Field>
        <Field label="Tên phụ huynh *" htmlFor="lead-parentName" error={err("parentName")}>
          <input
            id="lead-parentName"
            name="parentName"
            defaultValue={lead?.parent_name}
            className={fieldClass}
            autoComplete="off"
            aria-invalid={!!err("parentName")}
          />
        </Field>
        <Field label="Số điện thoại *" htmlFor="lead-phone" error={err("phone")}>
          <input
            id="lead-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            defaultValue={lead ? localPhone(lead.phone) : ""}
            placeholder="0912 345 678"
            className={fieldClass}
            aria-invalid={!!err("phone")}
          />
        </Field>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-xs font-semibold text-muted-foreground">Chương trình quan tâm *</legend>
        <div className="grid grid-cols-3 gap-2">
          {PROGRAM_KEYS.map((key, i) => (
            <label
              key={key}
              className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl bg-card px-2 py-2 text-center text-sm font-semibold leading-tight ring-1 ring-border transition-colors has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:checked]:ring-primary has-[:focus-visible]:ring-2"
            >
              <input type="radio" name="targetProgram" value={key} defaultChecked={lead ? lead.target_program === key : i === 0} className="sr-only" />
              {SUBJECTS[key]}
            </label>
          ))}
        </div>
        {err("targetProgram") && <p className="text-xs font-medium text-destructive">{err("targetProgram")}</p>}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Cơ sở *" htmlFor="lead-campus" error={err("campus")}>
          <select id="lead-campus" name="campus" defaultValue={lead?.campus ?? "CS1_XALA"} className={fieldClass}>
            {Object.entries(CAMPUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nguồn" htmlFor="lead-source" error={err("source")}>
          <select id="lead-source" name="source" defaultValue={lead?.source ?? "facebook"} className={fieldClass}>
            {Object.entries(LEAD_SOURCES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Hẹn gọi lại" htmlFor="lead-followUpOn" error={err("followUpOn")} hint="Thẻ hiện nhắc khi tới hạn">
          <input id="lead-followUpOn" name="followUpOn" type="date" defaultValue={lead?.follow_up_on ?? ""} className={fieldClass} />
        </Field>
        <Field label="Tư vấn viên phụ trách" htmlFor="lead-assignedTo" error={err("assignedTo")}>
          <select id="lead-assignedTo" name="assignedTo" defaultValue={lead?.assigned_to ?? ""} className={fieldClass}>
            <option value="">— Chưa phân công —</option>
            {consultants.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Ghi chú tư vấn" htmlFor="lead-notes" error={err("notes")} hint="Nhu cầu, tính cách của bé, khung giờ phụ huynh tiện…">
        <textarea
          id="lead-notes"
          name="notes"
          rows={3}
          maxLength={LEAD_NOTES_MAX}
          defaultValue={lead?.notes ?? ""}
          className={cn(fieldClass, "h-auto resize-y py-2.5")}
        />
      </Field>

      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingText="Đang lưu..." className="w-full sm:w-auto">
        {lead ? "Lưu thông tin" : "Thêm vào danh sách"}
      </SubmitButton>
    </form>
  );
}
