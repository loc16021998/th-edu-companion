import { z } from "zod";
import { addDays, isISODate, todayVN } from "@/lib/date";
import { LEAVE_BACKDATE_DAYS, LEAVE_MAX_DAYS, LEAVE_REASON_KEYS, type LeaveReason } from "./constants";

const dateSchema = z.string().refine(isISODate, "Ngày không hợp lệ");

export const createLeaveSchema = z
  .object({
    studentId: z.string().uuid("Học sinh không hợp lệ"),
    startDate: dateSchema,
    endDate: dateSchema,
    reason: z.enum(LEAVE_REASON_KEYS as [LeaveReason, ...LeaveReason[]], { errorMap: () => ({ message: "Vui lòng chọn lý do" }) }),
    note: z.string().trim().max(500, "Lời nhắn tối đa 500 ký tự"),
  })
  .superRefine((v, ctx) => {
    if (v.endDate < v.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "Ngày kết thúc phải sau ngày bắt đầu" });
    if (v.startDate < addDays(todayVN(), -LEAVE_BACKDATE_DAYS)) {
      ctx.addIssue({ code: "custom", path: ["startDate"], message: `Chỉ báo nghỉ lùi tối đa ${LEAVE_BACKDATE_DAYS} ngày` });
    }
    if (v.endDate > addDays(v.startDate, LEAVE_MAX_DAYS - 1)) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: `Mỗi đơn tối đa ${LEAVE_MAX_DAYS} ngày` });
    }
    if (v.reason === "other" && !v.note) ctx.addIssue({ code: "custom", path: ["note"], message: "Vui lòng ghi rõ lý do" });
  });
export type CreateLeaveInput = z.input<typeof createLeaveSchema>;

export const decideLeaveSchema = z.object({
  id: z.string().uuid("Đơn không hợp lệ"),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(300, "Lời nhắn tối đa 300 ký tự"),
});
export type DecideLeaveInput = z.input<typeof decideLeaveSchema>;
