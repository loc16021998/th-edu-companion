"use client";

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, PartyPopper, RefreshCw, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, SubmitButton, fieldClass, useFormAction } from "@/components/shared/form-field";
import { toast } from "@/components/ui/toast";
import { SUBJECTS, type SubjectKey } from "@/config/constants";
import { addDays, todayVN } from "@/lib/date";
import { cn, formatVND } from "@/lib/utils";
import { convertLead, findParentsByPhone, type ParentMatch } from "../actions";
import { PROGRAM_KEYS, addressParent, localPhone, programLabel } from "../constants";
import type { Lead } from "../queries";
import type { ClassOption } from "./trial-form";

export type FeeClassOption = ClassOption & { monthly_fee: number | null };

/** Mật khẩu tạm dễ đọc (không có 0/O, 1/l) để đọc cho phụ huynh qua điện thoại. */
function generatePassword() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return `TH${Array.from(bytes, (b) => chars[b % chars.length]).join("")}`;
}

/**
 * "Chuyển thành học viên chính thức": học sinh (lớp, môn) + tài khoản phụ huynh (dùng lại theo SĐT hoặc tạo mới)
 * + khoản học phí đầu tiên. Thành công → thẻ thông tin đăng nhập để gửi phụ huynh.
 */
export function ConvertLeadForm({ lead, classes, onDone }: { lead: Lead; classes: FeeClassOption[]; onDone?: () => void }) {
  const { state, pending, onSubmit, errors } = useFormAction(convertLead);
  const [matches, setMatches] = useState<ParentMatch[] | null>(null);
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [parentId, setParentId] = useState("");
  const [password, setPassword] = useState(generatePassword);
  const [parentPhone, setParentPhone] = useState(localPhone(lead.phone));
  const [copied, setCopied] = useState(false);

  // Gợi ý theo lịch học thử gần nhất: cơ sở + lớp đã học thử
  const lastTrial = lead.trials.find((t) => t.status === "completed") ?? lead.trials[0];
  const campusClasses = classes.filter((c) => c.campus === lead.campus);
  const [classId, setClassId] = useState(lastTrial?.class_id && campusClasses.some((c) => c.id === lastTrial.class_id) ? lastTrial.class_id : "");
  const cls = classes.find((c) => c.id === classId);
  const [feeAmount, setFeeAmount] = useState(() => (cls?.monthly_fee ? String(cls.monthly_fee) : ""));
  const today = todayVN();
  const month = `${today.slice(5, 7)}/${today.slice(0, 4)}`;

  useEffect(() => {
    let alive = true;
    findParentsByPhone(lead.phone)
      .catch(() => ({ ok: false as const, error: "" }))
      .then((res) => {
        if (!alive) return;
        const list = res.ok ? res.data : [];
        setMatches(list);
        if (list[0]) {
          setMode("existing");
          setParentId(list[0].id);
        }
      });
    return () => {
      alive = false;
    };
  }, [lead.phone]);

  // Chọn lớp → điền sẵn học phí tháng của lớp (vẫn sửa được)
  const pickClass = (id: string) => {
    setClassId(id);
    const fee = classes.find((c) => c.id === id)?.monthly_fee;
    if (fee && !feeAmount) setFeeAmount(String(fee));
  };

  const err = (k: string) => errors[k];
  const loginText = `Tài khoản TH EDU của ${addressParent(lead.parent_name)}:\n• Số điện thoại đăng nhập: ${parentPhone}\n• Mật khẩu: ${password}\nAnh/chị mở app TH EDU, chọn "Phụ huynh" để đăng nhập và nên đổi mật khẩu sau lần đầu.`;

  if (state.ok) {
    return (
      <div className="space-y-4 text-center">
        <span className="mx-auto flex size-14 animate-bounce-in items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <PartyPopper className="size-7" />
        </span>
        <p className="text-base font-bold">Chào mừng bé {lead.full_name} nhập học!</p>
        <p className="text-sm text-muted-foreground">{state.message}</p>
        {mode === "new" && (
          <div className="space-y-2 rounded-xl bg-muted/60 p-3 text-left">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <KeyRound className="size-3.5" /> Thông tin đăng nhập gửi phụ huynh
            </p>
            <p className="whitespace-pre-wrap break-words rounded-lg bg-card p-2.5 text-sm ring-1 ring-border">{loginText}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-9 rounded-lg"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(loginText);
                  setCopied(true);
                  toast.success("Đã sao chép thông tin đăng nhập");
                } catch {
                  toast.error("Không sao chép được");
                }
              }}
            >
              {copied ? <Check /> : <Copy />} Sao chép để gửi Zalo
            </Button>
          </div>
        )}
        <Button type="button" className="h-11 w-full rounded-xl" onClick={onDone}>
          Xong
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <input type="hidden" name="leadId" value={lead.id} />

      <section className="space-y-3">
        <h3 className="text-sm font-bold">1. Thông tin học sinh</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Họ tên học sinh *" htmlFor="cv-fullName" error={err("fullName")}>
            <input id="cv-fullName" name="fullName" defaultValue={lead.full_name} className={fieldClass} aria-invalid={!!err("fullName")} />
          </Field>
          <Field label="Ngày sinh" htmlFor="cv-dob" error={err("dob")}>
            <input id="cv-dob" name="dob" type="date" defaultValue={lead.dob ?? ""} className={fieldClass} />
          </Field>
        </div>
        <Field
          label="Xếp vào lớp *"
          htmlFor="cv-classId"
          error={err("classId")}
          hint={campusClasses.length === 0 ? "Cơ sở này chưa có lớp — tạo lớp ở mục Lớp học trước" : undefined}
        >
          <select
            id="cv-classId"
            name="classId"
            value={classId}
            onChange={(e) => pickClass(e.target.value)}
            className={fieldClass}
            aria-invalid={!!err("classId")}
          >
            <option value="">— Chọn lớp —</option>
            {campusClasses.map((c) => (
              <option key={c.id} value={c.id}>
                Lớp {c.name}
                {c.monthly_fee ? ` · ${formatVND(c.monthly_fee)}/tháng` : ""}
              </option>
            ))}
          </select>
        </Field>
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-semibold text-muted-foreground">Môn đăng ký *</legend>
          <div className="grid grid-cols-3 gap-2">
            {PROGRAM_KEYS.map((key) => (
              <label
                key={key}
                className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl bg-card px-2 py-2 text-center text-sm font-semibold leading-tight ring-1 ring-border has-[:checked]:bg-primary/10 has-[:checked]:text-primary has-[:checked]:ring-primary"
              >
                <input type="checkbox" name="subjects" value={key} defaultChecked={key === lead.target_program} className="sr-only" />
                {SUBJECTS[key as SubjectKey]}
              </label>
            ))}
          </div>
          {err("subjects") && <p className="text-xs font-medium text-destructive">{err("subjects")}</p>}
        </fieldset>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold">2. Tài khoản phụ huynh</h3>
        {matches === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Đang kiểm tra SĐT {localPhone(lead.phone)} đã có tài khoản chưa…
          </p>
        ) : (
          matches.length > 0 && (
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
              {(["existing", "new"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className={cn("min-h-10 rounded-lg px-2 text-sm font-semibold", mode === m ? "bg-card shadow-sm" : "text-muted-foreground")}
                >
                  {m === "existing" ? "Dùng tài khoản sẵn có" : "Tạo tài khoản mới"}
                </button>
              ))}
            </div>
          )
        )}
        <input type="hidden" name="parentMode" value={mode} />

        {mode === "existing" && matches ? (
          <fieldset className="space-y-2">
            <legend className="sr-only">Chọn tài khoản phụ huynh</legend>
            {matches.map((p) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-start gap-3 rounded-xl bg-card p-3 ring-1 ring-border has-[:checked]:bg-primary/5 has-[:checked]:ring-primary"
              >
                <input
                  type="radio"
                  name="parentId"
                  value={p.id}
                  checked={parentId === p.id}
                  onChange={() => setParentId(p.id)}
                  className="mt-1 size-4 accent-primary"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <UserRound className="size-4 text-muted-foreground" /> {p.full_name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {p.phone ? localPhone(p.phone) : ""}
                    {p.children.length > 0 && ` · Đang có con: ${p.children.join(", ")}`}
                  </span>
                </span>
              </label>
            ))}
            {err("parentId") && <p className="text-xs font-medium text-destructive">{err("parentId")}</p>}
          </fieldset>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Họ tên phụ huynh *" htmlFor="cv-parentFullName" error={err("parentFullName")}>
              <input
                id="cv-parentFullName"
                name="parentFullName"
                defaultValue={lead.parent_name}
                className={fieldClass}
                aria-invalid={!!err("parentFullName")}
              />
            </Field>
            <Field label="SĐT đăng nhập *" htmlFor="cv-parentPhone" error={err("parentPhone")}>
              <input
                id="cv-parentPhone"
                name="parentPhone"
                type="tel"
                inputMode="tel"
                value={parentPhone}
                onChange={(e) => setParentPhone(e.target.value)}
                className={fieldClass}
                aria-invalid={!!err("parentPhone")}
              />
            </Field>
            <Field label="Email (không bắt buộc)" htmlFor="cv-parentEmail" error={err("parentEmail")}>
              <input id="cv-parentEmail" name="parentEmail" type="email" className={fieldClass} autoComplete="off" />
            </Field>
            <Field label="Mật khẩu tạm *" htmlFor="cv-parentPassword" error={err("parentPassword")} hint="Gửi kèm SĐT cho phụ huynh sau khi chuyển">
              <div className="flex gap-2">
                <input
                  id="cv-parentPassword"
                  name="parentPassword"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={cn(fieldClass, "font-mono")}
                  autoComplete="new-password"
                  aria-invalid={!!err("parentPassword")}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-11 shrink-0 rounded-xl"
                  aria-label="Tạo mật khẩu khác"
                  onClick={() => setPassword(generatePassword())}
                >
                  <RefreshCw />
                </Button>
              </div>
            </Field>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold">3. Học phí khoá đầu tiên</h3>
        <Field label="Tên khoản *" htmlFor="cv-feeTitle" error={err("feeTitle")}>
          <input
            id="cv-feeTitle"
            name="feeTitle"
            defaultValue={`Học phí tháng ${month} – ${programLabel(lead.target_program)}`}
            className={fieldClass}
            aria-invalid={!!err("feeTitle")}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Số tiền (VNĐ) *"
            htmlFor="cv-feeAmount"
            error={err("feeAmount")}
            hint={feeAmount && Number(feeAmount) > 0 ? formatVND(Number(feeAmount)) : cls?.monthly_fee ? undefined : "Lớp chưa đặt học phí tháng"}
          >
            <input
              id="cv-feeAmount"
              name="feeAmount"
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={feeAmount}
              onChange={(e) => setFeeAmount(e.target.value)}
              className={fieldClass}
              aria-invalid={!!err("feeAmount")}
            />
          </Field>
          <Field label="Hạn đóng" htmlFor="cv-feeDueDate" error={err("feeDueDate")}>
            <input id="cv-feeDueDate" name="feeDueDate" type="date" defaultValue={addDays(today, 7)} className={fieldClass} />
          </Field>
        </div>
      </section>

      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingText="Đang chuyển..." className="w-full bg-emerald-600 hover:bg-emerald-600/90">
        <PartyPopper /> Chuyển thành học viên chính thức
      </SubmitButton>
    </form>
  );
}
