"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { INITIAL_FORM_STATE, type FormState } from "@/lib/form-state";
import { haptic, toast } from "@/components/ui/toast";

/** Ô nhập/chọn cao 44px — đủ lớn để chạm trên điện thoại, chữ 16px để iOS không tự phóng to. */
export const fieldClass =
  "h-11 w-full rounded-xl border border-input bg-card px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 aria-[invalid=true]:border-destructive md:text-sm";

export function Field({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-semibold text-muted-foreground">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={cn(
        "flex items-start gap-2 rounded-xl p-3 text-sm font-medium",
        state.ok ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-destructive/10 text-destructive ring-1 ring-destructive/20",
      )}
    >
      {state.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
      {state.message}
    </p>
  );
}

export function SubmitButton({
  children,
  pending,
  pendingText,
  className,
}: {
  children: React.ReactNode;
  pending: boolean;
  pendingText: string;
  className?: string;
}) {
  return (
    <Button type="submit" disabled={pending} className={cn("h-11 rounded-xl", className)}>
      {pending && <Loader2 className="animate-spin" />}
      {pending ? pendingText : children}
    </Button>
  );
}

/**
 * Gắn Server Action dạng (prevState, FormData) vào form qua onSubmit.
 * Không dùng `<form action>` vì React 19 tự xoá trắng form sau MỖI lần submit — kể cả khi lỗi,
 * làm người dùng mất dữ liệu đã nhập. Ở đây chỉ reset khi lưu thành công.
 */
export function useFormAction(serverAction: (prev: FormState, formData: FormData) => Promise<FormState>) {
  const [state, dispatch, pending] = useActionState(serverAction, INITIAL_FORM_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && state.at) formRef.current?.reset();
  }, [state.ok, state.at]);

  // Toast + âm báo / rung cho mọi form: thành công → toast xanh; lỗi chung (không phải lỗi từng ô) → toast đỏ.
  // Lỗi từng ô đã hiện ngay dưới ô nhập → chỉ rung nhẹ. Dòng thông báo trong form vẫn giữ để đọc lại.
  const announced = useRef(state);
  useEffect(() => {
    if (state === announced.current || !state.message) return;
    announced.current = state;
    if (state.ok) toast.success(state.message);
    else if (!state.fieldErrors || Object.keys(state.fieldErrors).length === 0) toast.error("Chưa thực hiện được", state.message);
    else haptic("error");
  }, [state]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => dispatch(formData));
  };

  return { state, pending, formRef, onSubmit, errors: state.fieldErrors ?? {} };
}
