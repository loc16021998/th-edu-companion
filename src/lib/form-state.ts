import type { ZodError } from "zod";

/** Trạng thái trả về của Server Action dạng form (useActionState). `at` đổi mỗi lần submit thành công → reset form. */
export type FormState = {
  ok: boolean;
  message: string;
  fieldErrors?: Partial<Record<string, string>>;
  at?: number;
};

export const INITIAL_FORM_STATE: FormState = { ok: false, message: "" };

export function formError(message: string, fieldErrors?: FormState["fieldErrors"]): FormState {
  return { ok: false, message, fieldErrors };
}

export function formSuccess(message: string): FormState {
  return { ok: true, message, at: Date.now() };
}

/** Lỗi zod → lỗi từng ô + thông báo chung là lỗi đầu tiên. */
export function zodFormError(error: ZodError): FormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    fieldErrors[key] ??= issue.message;
  }
  return formError(error.issues[0]?.message ?? "Dữ liệu không hợp lệ.", fieldErrors);
}

/** FormData → object phẳng (bỏ File) để đưa vào zod. */
export function formDataToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string") out[key] = value;
  });
  return out;
}
