import { z } from "zod";
import { SUBJECTS, type SubjectKey } from "@/config/constants";
import { uuidSchema } from "@/lib/validation";

/**
 * Đánh giá nhanh 1 chạm cho "Trợ lý viết nhận xét" ở Sổ liên lạc (dùng chung client + server).
 * Client chỉ gửi MÃ tag; server đổi sang nhãn → không có chữ tự do nào của trình duyệt lọt vào prompt AI.
 * `tone`: "good" = điểm tốt (khen trước), "grow" = điểm cần rèn (nhắc khéo sau).
 */
export type AiTag = { id: string; label: string; tone: "good" | "grow" };

export const MOOD_TAGS = [
  { id: "excited", label: "Hào hứng 😃", tone: "good" },
  { id: "obedient", label: "Ngoan ngoãn 😊", tone: "good" },
  { id: "quiet", label: "Trầm tính 😐", tone: "grow" },
  { id: "needs_effort", label: "Cần cố gắng 🙁", tone: "grow" },
] as const satisfies readonly AiTag[];

export const ATTITUDE_TAGS = [
  { id: "focused", label: "Tập trung cao", tone: "good" },
  { id: "cooperative", label: "Hợp tác tốt", tone: "good" },
  { id: "chatty", label: "Hay nói chuyện", tone: "grow" },
  { id: "distracted", label: "Hơi lơ đễnh", tone: "grow" },
] as const satisfies readonly AiTag[];

export const SUBJECT_TAGS = {
  tien_tieu_hoc: [
    { id: "blending", label: "Ghép vần tốt", tone: "good" },
    { id: "reads_clearly", label: "Đọc to rõ ràng", tone: "good" },
    { id: "letters_practice", label: "Cần luyện thêm mặt chữ", tone: "grow" },
  ],
  luyen_chu: [
    { id: "even_strokes", label: "Nét chữ đều đẹp", tone: "good" },
    { id: "good_posture", label: "Tư thế ngồi chuẩn", tone: "good" },
    { id: "pen_grip", label: "Cầm bút chưa đúng", tone: "grow" },
    { id: "off_line", label: "Chữ viết còn chệch dòng", tone: "grow" },
  ],
  toan_tu_duy: [
    { id: "quick_mental", label: "Nhẩm nhanh", tone: "good" },
    { id: "logic", label: "Tư duy logic tốt", tone: "good" },
    { id: "needs_guidance", label: "Cần cô hướng dẫn thêm", tone: "grow" },
  ],
} as const satisfies Record<SubjectKey, readonly AiTag[]>;

const ids = <T extends readonly AiTag[]>(tags: T) => tags.map((t) => t.id) as [T[number]["id"], ...T[number]["id"][]];

/** Lựa chọn của giáo viên. Tâm trạng chọn 1; thái độ & từng môn chọn nhiều. */
export const aiNoteRequestSchema = z.object({
  studentId: uuidSchema,
  mood: z.enum(ids(MOOD_TAGS)).nullable(),
  attitude: z.array(z.enum(ids(ATTITUDE_TAGS))).max(ATTITUDE_TAGS.length),
  subjects: z.object({
    tien_tieu_hoc: z.array(z.enum(ids(SUBJECT_TAGS.tien_tieu_hoc))).max(SUBJECT_TAGS.tien_tieu_hoc.length),
    luyen_chu: z.array(z.enum(ids(SUBJECT_TAGS.luyen_chu))).max(SUBJECT_TAGS.luyen_chu.length),
    toan_tu_duy: z.array(z.enum(ids(SUBJECT_TAGS.toan_tu_duy))).max(SUBJECT_TAGS.toan_tu_duy.length),
  }),
});
export type AiNoteRequest = z.infer<typeof aiNoteRequestSchema>;
export type AiNoteSelection = Omit<AiNoteRequest, "studentId">;

export const EMPTY_SELECTION: AiNoteSelection = { mood: null, attitude: [], subjects: { tien_tieu_hoc: [], luyen_chu: [], toan_tu_duy: [] } };

export function selectionCount(s: AiNoteSelection): number {
  return (s.mood ? 1 : 0) + s.attitude.length + Object.values(s.subjects).reduce((n, list) => n + list.length, 0);
}

const find = (tags: readonly AiTag[], id: string) => tags.find((t) => t.id === id)!;
/** Bỏ emoji ở nhãn tâm trạng khi đưa vào câu văn */
const plain = (label: string) => label.replace(/\s*\p{Extended_Pictographic}/gu, "").trim();

/** Các nhận xét đã chọn, nhóm theo mục — dùng cho prompt AI và mẫu dự phòng. */
export function describeSelection(s: AiNoteSelection) {
  const good: string[] = [];
  const grow: string[] = [];
  const lines: string[] = [];
  const push = (group: string, tags: AiTag[]) => {
    if (!tags.length) return;
    lines.push(`- ${group}: ${tags.map((t) => plain(t.label)).join(", ")}`);
    for (const t of tags) (t.tone === "good" ? good : grow).push(plain(t.label).toLowerCase());
  };
  push("Tâm trạng", s.mood ? [find(MOOD_TAGS, s.mood)] : []);
  push("Thái độ học tập", s.attitude.map((id) => find(ATTITUDE_TAGS, id)));
  for (const key of Object.keys(SUBJECT_TAGS) as SubjectKey[]) {
    push(`Môn ${SUBJECTS[key]}`, s.subjects[key].map((id) => find(SUBJECT_TAGS[key], id)));
  }
  return { lines, good, grow };
}

/**
 * Nhận xét soạn theo mẫu từ chính các tag (không cần AI / mạng chập chờn / AI lỗi).
 * Đúng văn phong TH EDU: khen trước, nhắc khéo sau, kết bằng lời động viên.
 */
export function buildTemplateNotes(childName: string, s: AiNoteSelection): string[] {
  const { good, grow } = describeSelection(s);
  const praise = good.length ? `Hôm nay bé ${childName} ${joinVi(good)}, cô rất vui và tự hào về con.` : `Hôm nay bé ${childName} đã tham gia đầy đủ các hoạt động trên lớp.`;
  const remind = grow.length ? `Con còn ${joinVi(grow)} — cô sẽ kèm thêm trên lớp, Ba mẹ nhắc nhẹ con ở nhà giúp cô nhé.` : "";
  const cheer = grow.length ? "Cô tin con sẽ tiến bộ thật nhanh!" : "Ba mẹ nhớ khen ngợi để con thêm tự tin nhé!";
  const short = [praise, remind || cheer].join(" ");
  const warm = [
    good.length ? `Cô gửi Ba mẹ đôi dòng về bé ${childName}: hôm nay con ${joinVi(good)}.` : `Cô gửi Ba mẹ đôi dòng về bé ${childName} hôm nay.`,
    grow.length ? `Bên cạnh đó, con cần rèn thêm: ${joinVi(grow)}. Mỗi ngày một chút, con sẽ làm tốt hơn.` : "Con đang tiến bộ đều, cô sẽ tiếp tục giao bài vừa sức để con phát triển.",
    "Cảm ơn Ba mẹ đã luôn đồng hành cùng con và Trung tâm!",
  ].join(" ");
  return [short, warm];
}

function joinVi(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} và ${items[items.length - 1]}`;
}
