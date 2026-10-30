// Nhãn hiển thị cho nhật ký hoạt động (audit_logs).

export const AUDIT_TABLES = {
  attendance: "Điểm danh",
  daily_reports: "Sổ liên lạc",
  fees: "Học phí",
  fee_payments: "Lịch sử đóng học phí",
  students: "Học sinh",
  profiles: "Tài khoản",
  teacher_assignments: "Phân công giáo viên",
  classes: "Lớp học",
  teacher_attendance: "Chấm công giáo viên",
  homework_submissions: "Chấm bài tập",
  leave_requests: "Đơn xin nghỉ",
  monthly_summaries: "Tổng kết tháng",
  payment_config: "Tài khoản nhận học phí",
  bank_transactions: "Giao dịch ngân hàng",
  leads: "Tuyển sinh",
  trial_classes: "Lịch học thử",
  student_star_awards: "Tặng sao buổi học",
  student_badge_awards: "Trao huy hiệu",
  reward_redemptions: "Trao quà khích lệ",
  achievement_badges: "Danh mục huy hiệu",
  reward_milestones: "Mốc quà khích lệ",
  teaching_sessions: "Ca dạy giáo viên",
  teacher_pay_rates: "Đơn giá lương",
} as const satisfies Record<string, string>;
export type AuditTable = keyof typeof AUDIT_TABLES;
export const AUDIT_TABLE_KEYS = Object.keys(AUDIT_TABLES) as AuditTable[];

export const AUDIT_ACTIONS = {
  CREATE: { label: "Tạo mới", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" },
  UPDATE: { label: "Sửa", className: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200" },
  DELETE: { label: "Xoá", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" },
} as const;
export type AuditAction = keyof typeof AUDIT_ACTIONS;

export const AUDIT_ROLES = { admin: "Quản trị", teacher: "Giáo viên", system: "Hệ thống" } as const;
export type AuditRole = keyof typeof AUDIT_ROLES;

/** Tên cột dễ hiểu; cột không có trong danh sách hiển thị nguyên tên. */
export const AUDIT_FIELDS: Record<string, string> = {
  status: "Trạng thái",
  note: "Ghi chú",
  date: "Ngày",
  amount: "Số tiền",
  paid_amount: "Đã đóng",
  due_date: "Hạn đóng",
  title: "Nội dung khoản thu",
  period: "Tháng học phí",
  mood: "Tâm trạng",
  subjects_summary: "Đánh giá môn học",
  teacher_note: "Nhận xét",
  media_urls: "Ảnh / video",
  teacher_id: "Giáo viên",
  student_id: "Học sinh",
  parent_id: "Phụ huynh",
  full_name: "Họ tên",
  dob: "Ngày sinh",
  campus: "Cơ sở",
  class_name: "Lớp",
  role: "Vai trò",
  phone: "Số điện thoại",
  subjects: "Môn học",
  stars: "Số sao",
  teacher_comment: "Lời phê",
  hearted: "Thả tim",
  graded_by: "Người chấm",
  graded_at: "Thời điểm chấm",
  decision_note: "Ghi chú xử lý",
  start_date: "Từ ngày",
  end_date: "Đến ngày",
  reason: "Lý do",
  account_no: "Số tài khoản",
  bank_bin: "Ngân hàng",
  account_name: "Chủ tài khoản",
  matched_fee_id: "Khoản học phí",
  content: "Nội dung chuyển khoản",
  student_code: "Mã học sinh",
};

/** Cột giá trị trạng thái → nhãn tiếng Việt */
export const AUDIT_VALUE_LABELS: Record<string, string> = {
  present: "Có mặt",
  absent: "Vắng",
  late: "Đi muộn",
  absent_with_permission: "Nghỉ có phép",
  paid: "Đã đóng đủ",
  partial: "Đóng một phần",
  unpaid: "Chưa đóng",
  pending: "Chờ duyệt",
  approved: "Đồng ý",
  rejected: "Từ chối",
  cancelled: "Đã huỷ",
  submitted: "Đã nộp",
  graded: "Đã chấm",
  matched: "Đã khớp",
  unmatched: "Chưa khớp",
  ignored: "Bỏ qua",
  admin: "Quản trị",
  teacher: "Giáo viên",
  parent: "Phụ huynh",
};

export const SECURITY_SEVERITY = {
  critical: { label: "Nghiêm trọng", className: "bg-red-600 text-white" },
  high: { label: "Cao", className: "bg-orange-500 text-white" },
  info: { label: "Lưu ý", className: "bg-muted text-muted-foreground" },
} as const;
