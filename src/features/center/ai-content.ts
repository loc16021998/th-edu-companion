"use server";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import * as z4 from "zod/v4";
import { ORGANIZATION } from "@/config/constants";
import { rateLimit, tooManyMessage } from "@/lib/security/rate-limit";
import { SCHEDULE_LABEL } from "@/lib/schedule";
import { requireRole } from "@/features/auth/queries";
import type { ActionResult } from "@/types/action-result";
import {
  ANNOUNCEMENT_STYLES,
  COURSES,
  COURSE_KEYS,
  IDEA_KINDS,
  IDEA_KIND_KEYS,
  SEASONS,
  SEASON_KEYS,
  STYLE_KEYS,
  splitPoints,
  templateDrafts,
  templateIdeas,
  type AnnouncementDraft,
  type EventIdea,
} from "./ai-content-shared";

const MODEL = "claude-opus-5-5";

const CENTER = `Hệ thống giáo dục TH EDU — trung tâm Tiền tiểu học, Luyện chữ đẹp, Toán tư duy cho trẻ 4–7 tuổi.
Cơ sở: ${ORGANIZATION.campuses.map((c) => `${c.label} ${c.address}`).join("; ")}. Hotline: ${ORGANIZATION.phones.map((p) => p.display).join(" - ")}.
Lịch học: ${SCHEDULE_LABEL}.`;

const RULES = `- Tiếng Việt chuẩn, không lỗi chính tả. Gọi phụ huynh là "quý phụ huynh" / "ba mẹ", gọi học sinh là "các con" / "các bé".
- KHÔNG bịa ngày giờ, mức học phí, phần trăm giảm giá, địa điểm, tên người… mà quản trị không cung cấp — chỗ còn thiếu để dạng [..] để quản trị tự điền.
- Không hứa hẹn kết quả học tập ("cam kết đỗ", "100%"…), không so sánh / chê trung tâm khác.`;

async function callClaude<T>(system: string, prompt: string, schema: z4.ZodType<T>, effort: "low" | "medium"): Promise<T | null> {
  const client = new Anthropic({ timeout: 60_000, maxRetries: 1 });
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort, format: betaZodOutputFormat(schema) },
      // Bộ phân loại an toàn có thể từ chối nhầm → tự chạy lại trên model dự phòng Anthropic khuyến nghị
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") return null;
    return (response.parsed_output as T | null) ?? null;
  } catch (err) {
    console.error("[ai-content] Lỗi khi gọi Claude:", err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : err);
    return null;
  }
}

async function guard() {
  const profile = await requireRole("admin");
  const limit = await rateLimit("aiAdminContent", profile.id);
  return limit.ok ? null : tooManyMessage(limit.retryAfter);
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ============================================================================ 1–2. Viết thông báo 3 văn phong

const draftSchema = z.object({
  points: z.string().trim().min(5, "Nhập vài ý chính cho thông báo").max(2000, "Ý chính tối đa 2000 ký tự"),
  categoryLabel: z.string().trim().max(60),
  audienceLabel: z.string().trim().max(200),
});

const DraftOutput = z4.object({
  warm: z4.object({ title: z4.string(), body: z4.string() }),
  formal: z4.object({ title: z4.string(), body: z4.string() }),
  social: z4.object({ title: z4.string(), body: z4.string() }),
});

export type DraftResult = { drafts: AnnouncementDraft[]; source: "ai" | "template"; notice: string | null };

/** "✨ AI Viết thông báo chuẩn": ý chính → 3 văn phong (ấm áp / trang trọng / đăng Zalo-Facebook). */
export async function draftAnnouncement(input: z.input<typeof draftSchema>): Promise<ActionResult<DraftResult>> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  const limitError = await guard();
  if (limitError) return { ok: false, error: limitError };
  const v = parsed.data;
  const fallback = templateDrafts(splitPoints(v.points), v.categoryLabel);

  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: true, data: { drafts: fallback, source: "template", notice: "Trung tâm chưa bật AI — đây là bản soạn theo mẫu từ ý chính, quản trị sửa thêm trước khi đăng." } };
  }

  const system = `Bạn là chuyên viên truyền thông của ${CENTER}
Nhiệm vụ: từ các ý chính quản trị nhập, viết 1 thông báo theo 3 văn phong:
- warm (${ANNOUNCEMENT_STYLES.warm.label}): thân thương, ân cần với phụ huynh mầm non / tiểu học; 1–2 emoji nhẹ nhàng.
- formal (${ANNOUNCEMENT_STYLES.formal.label}): súc tích, đủ thông tin theo gạch đầu dòng, không emoji.
- social (${ANNOUNCEMENT_STYLES.social.label}): sôi nổi, nhiều icon sinh động, dòng ngắn dễ đọc trên điện thoại, kết bằng lời kêu gọi + 2–4 hashtag (#THEDU…), để đăng nhóm Zalo / Facebook.
Yêu cầu chung:
${RULES}
- Giữ ĐỦ và ĐÚNG mọi thông tin trong ý chính (ngày, giờ, lịch học bù…). Có thể sắp xếp lại cho mạch lạc.
- title ≤ 120 ký tự; body 300–1200 ký tự, chỉ văn bản thuần (xuống dòng, gạch đầu dòng "- "), không markdown khác.`;
  const prompt = `Loại thông báo: ${v.categoryLabel || "Thông báo chung"}\nGửi tới: ${v.audienceLabel || "Toàn bộ phụ huynh"}\nÝ chính:\n${v.points}`;
  const out = await callClaude(system, prompt, DraftOutput, "low");
  if (!out) return { ok: true, data: { drafts: fallback, source: "template", notice: "AI đang bận — đây là bản soạn theo mẫu từ ý chính." } };

  const drafts = STYLE_KEYS.map((style) => ({ style, title: clip(out[style].title.trim(), 150), body: clip(out[style].body.trim(), 5000) })).filter((d) => d.title && d.body);
  return { ok: true, data: { drafts: drafts.length ? drafts : fallback, source: drafts.length ? "ai" : "template", notice: null } };
}

// ============================================================================ 3. Ý tưởng sự kiện / khuyến mãi / tư vấn tuyển sinh

const ideaSchema = z.object({
  season: z.enum(SEASON_KEYS as [keyof typeof SEASONS, ...(keyof typeof SEASONS)[]]),
  course: z.enum(COURSE_KEYS as [keyof typeof COURSES, ...(keyof typeof COURSES)[]]),
  kind: z.enum(IDEA_KIND_KEYS as [keyof typeof IDEA_KINDS, ...(keyof typeof IDEA_KINDS)[]]),
  note: z.string().trim().max(500, "Ghi chú tối đa 500 ký tự"),
});

const IdeaOutput = z4.object({
  ideas: z4.array(
    z4.object({
      name: z4.string(),
      goal: z4.string(),
      plan: z4.array(z4.string()),
      offer: z4.string(),
      talkingPoints: z4.array(z4.string()),
      announcementPoints: z4.string(),
    }),
  ),
});

export type IdeaResult = { ideas: EventIdea[]; source: "ai" | "template"; notice: string | null };

/** Lên ý tưởng sự kiện ngoại khoá / khuyến mãi khai giảng / kịch bản tư vấn tuyển sinh theo mùa. */
export async function suggestIdeas(input: z.input<typeof ideaSchema>): Promise<ActionResult<IdeaResult>> {
  const parsed = ideaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  const limitError = await guard();
  if (limitError) return { ok: false, error: limitError };
  const v = parsed.data;
  const fallback = templateIdeas(v.season, v.course, v.kind);

  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: true, data: { ideas: fallback, source: "template", notice: "Trung tâm chưa bật AI — đây là ý tưởng mẫu, quản trị điều chỉnh theo thực tế." } };
  }

  const system = `Bạn là chuyên gia marketing giáo dục & tổ chức sự kiện cho ${CENTER}
Nhiệm vụ: đề xuất 3 ý tưởng KHẢ THI, chi phí hợp lý, phù hợp trẻ 4–7 tuổi và phụ huynh Việt Nam.
${RULES}
Mỗi ý tưởng:
- name: tên chương trình hấp dẫn (≤ 80 ký tự); goal: mục tiêu (1 câu).
- plan: 4–6 bước / kịch bản tổ chức theo thời gian (mỗi bước ≤ 140 ký tự).
- offer: ưu đãi / quà tặng gợi ý (số liệu để [..]).
- talkingPoints: 3–4 ý tư vấn phụ huynh (lợi ích cho con, phương pháp, sổ liên lạc điện tử theo dõi hằng ngày…).
- announcementPoints: các ý chính (ngăn cách bởi "; ") để tạo thông báo gửi phụ huynh.`;
  const prompt = `Dịp: ${SEASONS[v.season].label}\nKhoá học: ${COURSES[v.course]}\nLoại ý tưởng: ${IDEA_KINDS[v.kind].label}${v.note ? `\nGhi chú của quản trị: ${v.note}` : ""}`;
  const out = await callClaude(system, prompt, IdeaOutput, "medium");
  const ideas = (out?.ideas ?? [])
    .slice(0, 3)
    .map((i) => ({
      name: clip(i.name.trim(), 100),
      goal: clip(i.goal.trim(), 240),
      plan: i.plan.slice(0, 6).map((p) => clip(p.trim(), 200)),
      offer: clip(i.offer.trim(), 300),
      talkingPoints: i.talkingPoints.slice(0, 4).map((p) => clip(p.trim(), 200)),
      announcementPoints: clip(i.announcementPoints.trim(), 800),
    }))
    .filter((i) => i.name && i.plan.length);
  if (!ideas.length) return { ok: true, data: { ideas: fallback, source: "template", notice: "AI đang bận — đây là ý tưởng mẫu." } };
  return { ok: true, data: { ideas, source: "ai", notice: null } };
}
