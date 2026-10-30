"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { Field, FormMessage, SubmitButton, fieldClass, useFormAction } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";
import { changePassword } from "../actions";

function PasswordInput({ id, name, autoComplete, invalid }: { id: string; name: string; autoComplete: string; invalid: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required
        maxLength={72}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
        className={cn(fieldClass, "pr-11")}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        aria-pressed={visible}
        className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/** Tự đổi mật khẩu (mọi vai trò): nhập mật khẩu hiện tại + mật khẩu mới 2 lần. */
export function ChangePasswordForm() {
  const { state, pending, formRef, onSubmit, errors: err } = useFormAction(changePassword);

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border sm:p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <KeyRound className="size-5 text-primary" /> Đổi mật khẩu
      </h2>

      <Field label="Mật khẩu hiện tại" htmlFor="pw-current" error={err.currentPassword}>
        <PasswordInput id="pw-current" name="currentPassword" autoComplete="current-password" invalid={!!err.currentPassword} />
      </Field>
      <Field label="Mật khẩu mới" htmlFor="pw-new" error={err.newPassword} hint="Tối thiểu 8 ký tự, nên có chữ hoa, chữ thường và số.">
        <PasswordInput id="pw-new" name="newPassword" autoComplete="new-password" invalid={!!err.newPassword} />
      </Field>
      <Field label="Nhập lại mật khẩu mới" htmlFor="pw-confirm" error={err.confirmPassword}>
        <PasswordInput id="pw-confirm" name="confirmPassword" autoComplete="new-password" invalid={!!err.confirmPassword} />
      </Field>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-muted/60 p-3 text-sm">
        <input type="checkbox" name="signOutOthers" className="mt-0.5 size-4 accent-[hsl(var(--primary))]" />
        <span>
          <span className="font-semibold">Đăng xuất khỏi các thiết bị khác</span>
          <span className="block text-xs text-muted-foreground">Nên chọn nếu nghi ngờ người khác biết mật khẩu cũ.</span>
        </span>
      </label>

      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingText="Đang đổi..." className="w-full sm:w-auto">
        <KeyRound /> Đổi mật khẩu
      </SubmitButton>
    </form>
  );
}
