import { z } from "zod";
import { normalizeVietnamesePhone } from "@/features/auth/schema";

const CAMPUS = z.enum(["CS1_XALA", "CS2_NGOTHINHAM"], { errorMap: () => ({ message: "Cơ sở không hợp lệ" }) });
const km = z.number().min(0).max(500).nullable().optional();

export const transferRequestSchema = z
  .object({
    studentId: z.string().uuid("Vui lòng chọn bé"),
    toCampus: CAMPUS,
    reason: z.string().trim().max(500, "Lý do tối đa 500 ký tự").optional().default(""),
    distanceFromKm: km,
    distanceToKm: km,
  });

const contactSchema = z.object({
  name: z.string().trim().min(2, "Nhập tên người phụ trách").max(40, "Tên tối đa 40 ký tự"),
  phone: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const p = normalizeVietnamesePhone(v);
      if (!p) {
        ctx.addIssue({ code: "custom", message: `Số điện thoại không hợp lệ: ${v}` });
        return z.NEVER;
      }
      return p;
    }),
});

const httpsUrl = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || /^https:\/\//.test(v), "Link phải bắt đầu bằng https://");

export const campusProfileSchema = z.object({
  campus: CAMPUS,
  name: z.string().trim().min(2, "Nhập tên cơ sở").max(80),
  address: z.string().trim().min(5, "Nhập địa chỉ").max(300, "Địa chỉ tối đa 300 ký tự"),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  locationVerified: z.boolean(),
  googleMapsUrl: httpsUrl,
  contacts: z.array(contactSchema).max(6, "Tối đa 6 số liên hệ"),
  openingHours: z.string().trim().min(3, "Nhập giờ mở cửa").max(120),
});
export type CampusProfileInput = z.input<typeof campusProfileSchema>;

export const decideTransferSchema = z
  .object({
    id: z.string().uuid("Đơn không hợp lệ"),
    decision: z.enum(["approved", "rejected"]),
    classId: z.string().uuid().nullable(),
    note: z.string().trim().max(500, "Ghi chú tối đa 500 ký tự").optional().default(""),
  })
  .refine((v) => v.decision === "rejected" || v.classId, { path: ["classId"], message: "Chọn lớp mới cho bé ở cơ sở mới" });
