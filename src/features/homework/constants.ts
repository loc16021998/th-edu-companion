// Hằng số dùng chung server + client cho "Góc Đồng Hành Tại Nhà".

/** Kho lưu trữ PRIVATE: {student_id}/{assignment_id}/{file} — bài làm của bé + lời nhắn thoại của cô. */
export const HOMEWORK_BUCKET = "homework";
export const MAX_HOMEWORK_FILES = 10;
export const MAX_VOICE_SECONDS = 60;

export const SUBMISSION_TYPES = {
  any: { label: "Ảnh hoặc video", accept: "image/*,video/*" },
  photo: { label: "Ảnh chụp", accept: "image/*" },
  video: { label: "Video", accept: "video/*" },
} as const;
export type SubmissionType = keyof typeof SUBMISSION_TYPES;

/** Trạng thái hiển thị cho phụ huynh / giáo viên. */
export type HomeworkStatus = "pending" | "submitted" | "graded";
export const HOMEWORK_STATUS: Record<HomeworkStatus, { label: string; badge: string }> = {
  pending: { label: "Chưa nộp", badge: "bg-slate-100 text-slate-700 ring-slate-200" },
  submitted: { label: "Đã nộp", badge: "bg-sky-100 text-sky-700 ring-sky-200" },
  graded: { label: "Đã được cô chấm", badge: "bg-emerald-100 text-emerald-700 ring-emerald-200" },
};

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** Bài làm: {student}/{assignment}/{tên}.{đuôi ảnh/video} */
export const HOMEWORK_MEDIA_RE = new RegExp(`^${UUID}/${UUID}/[\\w.-]{1,100}\\.(jpe?g|png|webp|gif|heic|heif|mp4|mov|m4v|webm|3gp)$`, "i");
/** Lời nhắn thoại của cô: {student}/{assignment}/voice-….{đuôi âm thanh} */
export const HOMEWORK_VOICE_RE = new RegExp(`^${UUID}/${UUID}/voice-[\\w.-]{1,80}\\.(webm|ogg|mp4|m4a|aac|mp3|wav)$`, "i");
