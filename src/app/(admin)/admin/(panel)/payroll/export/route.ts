import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/features/auth/queries";
import { getPayroll } from "@/features/teaching/queries";
import {
  PAID_STATUSES,
  PAY_SUBJECTS,
  PAY_SUBJECT_KEYS,
  SESSION_STATUS,
  campusShort,
  clock,
  isMonth,
  minutesBetween,
  monthLabel,
  subjectLabel,
  type SessionStatus,
} from "@/features/teaching/constants";
import { buildCsv, buildXlsx, type Cell } from "@/lib/export/xlsx";
import { todayVN } from "@/lib/date";

/** Xuất bảng lương tháng: ?month=2026-10&format=xlsx|csv. Chỉ quản trị viên. */
export async function GET(request: NextRequest) {
  await requireRole("admin");
  const { searchParams } = request.nextUrl;
  const month = isMonth(searchParams.get("month")) ? searchParams.get("month")! : todayVN().slice(0, 7);
  const format = searchParams.get("format") === "csv" ? "csv" : "xlsx";

  const payroll = await getPayroll(month);
  if (!payroll.available) return NextResponse.json({ error: "Chưa chạy apply-teaching-payroll.sql" }, { status: 409 });

  const nameOf = new Map(payroll.teachers.map((t) => [t.id, t.full_name]));
  const phone = (p: string | null) => (p ? p.replace(/^\+?84/, "0") : "");

  const summary: Cell[][] = [
    ["STT", "Giáo viên", "SĐT", ...PAY_SUBJECT_KEYS.map((k) => `Số buổi ${PAY_SUBJECTS[k]}`), "Tổng số buổi", "Thành tiền (VNĐ)", "Cần xem lại"],
    ...payroll.rows.map((r, i) => [
      i + 1,
      r.teacherName,
      phone(r.phone),
      ...PAY_SUBJECT_KEYS.map((k) => r.lines.filter((l) => l.subject === k).reduce((s, l) => s + l.sessions, 0)),
      r.sessions,
      r.amount,
      [r.flagged ? `${r.flagged} ca cần xem lại` : "", r.missingRate ? "Thiếu đơn giá" : ""].filter(Boolean).join("; "),
    ]),
    [
      "",
      "TỔNG CỘNG",
      "",
      ...PAY_SUBJECT_KEYS.map(() => ""),
      payroll.rows.reduce((s, r) => s + r.sessions, 0),
      payroll.rows.reduce((s, r) => s + r.amount, 0),
      "",
    ],
  ];
  const lines: Cell[][] = [
    ["Giáo viên", "Môn", "Số buổi", "Đơn giá / buổi (VNĐ)", "Thành tiền (VNĐ)"],
    ...payroll.rows.flatMap((r) => r.lines.map((l) => [r.teacherName, PAY_SUBJECTS[l.subject], l.sessions, l.rate ?? "Chưa có đơn giá", l.amount])),
  ];
  const details: Cell[][] = [
    ["Ngày", "Giáo viên", "Cơ sở", "Lớp", "Môn", "Bắt đầu", "Kết thúc", "Số phút", "Trạng thái", "Tính lương", "Đơn giá (VNĐ)", "Ngoài lịch", "Ghi chú"],
    ...payroll.sessions.map((s) => [
      s.date.split("-").reverse().join("/"),
      nameOf.get(s.teacher_id) ?? "",
      campusShort(s.campus),
      s.class_name,
      subjectLabel(s.subject),
      clock(s.checked_in_at),
      clock(s.checked_out_at),
      minutesBetween(s.checked_in_at, s.checked_out_at),
      SESSION_STATUS[s.status as SessionStatus]?.label ?? s.status,
      PAID_STATUSES.includes(s.status) ? "Có" : "Không",
      s.rate,
      s.off_schedule ? "Có" : "",
      s.note ?? "",
    ]),
  ];

  const file = `bang-luong-giao-vien-${month}`;
  if (format === "csv") {
    return new NextResponse(buildCsv(summary), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${file}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }
  const xlsx = buildXlsx([
    { name: `Tổng hợp ${monthLabel(month).replace("/", "-")}`, rows: summary, widths: [6, 28, 14, 14, 14, 14, 12, 12, 18, 24] },
    { name: "Theo môn & đơn giá", rows: lines, widths: [28, 16, 10, 20, 18] },
    { name: "Chi tiết ca dạy", rows: details, widths: [12, 26, 18, 10, 16, 10, 10, 10, 18, 11, 14, 11, 36] },
  ]);
  return new NextResponse(new Uint8Array(xlsx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
