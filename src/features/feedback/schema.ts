import { z } from "zod";
import { FEEDBACK_CATEGORY_KEYS, FEEDBACK_KIND_KEYS, FEEDBACK_MAX } from "./constants";

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const submitFeedbackSchema = z
  .object({
    kind: z.enum(FEEDBACK_KIND_KEYS, { errorMap: () => ({ message: "Vui lòng chọn loại" }) }),
    category: z.enum(FEEDBACK_CATEGORY_KEYS, { errorMap: () => ({ message: "Vui lòng chọn chủ đề" }) }),
    studentId: z
      .string()
      .optional()
      .transform((v) => v || null)
      .pipe(z.string().uuid("Học sinh không hợp lệ").nullable()),
    content: z
      .string()
      .trim()
      .min(5, "Nội dung tối thiểu 5 ký tự")
      .max(FEEDBACK_MAX, `Nội dung tối đa ${FEEDBACK_MAX} ký tự`),
    anonymous: checkbox,
    contactName: z.string().trim().max(100, "Tên tối đa 100 ký tự").optional().default(""),
    contactPhone: z.string().trim().max(20).optional().default(""),
    wantsCallback: checkbox,
  })
  .superRefine((v, ctx) => {
    if (v.anonymous) return;
    if (v.wantsCallback && !v.contactPhone) ctx.addIssue({ code: "custom", path: ["contactPhone"], message: "Nhập số điện thoại để trung tâm gọi lại" });
    if (v.contactPhone && !/^(\+?84|0)[0-9]{9}$/.test(v.contactPhone.replace(/[\s.-]/g, "")))
      ctx.addIssue({ code: "custom", path: ["contactPhone"], message: "Số điện thoại không hợp lệ (vd: 0912 345 678)" });
  });

export const replyFeedbackSchema = z.object({
  id: z.string().uuid("Phản hồi không hợp lệ"),
  reply: z.string().trim().max(FEEDBACK_MAX, `Trả lời tối đa ${FEEDBACK_MAX} ký tự`),
  status: z.enum(["new", "in_progress", "resolved"]),
});

/** SĐT liên hệ → định dạng lưu trong DB (+84…). */
export function normalizeContactPhone(raw: string): string | null {
  const digits = raw.replace(/[\s.-]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+84")) return digits;
  if (digits.startsWith("84")) return `+${digits}`;
  return `+84${digits.replace(/^0/, "")}`;
}
