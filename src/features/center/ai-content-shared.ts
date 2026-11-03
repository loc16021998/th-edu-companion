/**
 * Trợ lý AI sáng tạo nội dung cho Quản trị (Truyền thông trung tâm) — phần dùng chung client + server, không gọi mạng.
 * Gồm cả bản soạn theo mẫu khi chưa bật AI / AI lỗi.
 */

export const ANNOUNCEMENT_STYLES = {
  warm: { label: "Ấm áp, tình cảm", hint: "Gửi phụ huynh mầm non / tiểu học", emoji: "💛" },
  formal: { label: "Ngắn gọn, trang trọng", hint: "Rõ ràng, đủ thông tin", emoji: "📋" },
  social: { label: "Hứng khởi, nhiều icon", hint: "Đăng nhóm Zalo / Facebook", emoji: "🎉" },
} as const;
export type AnnouncementStyle = keyof typeof ANNOUNCEMENT_STYLES;
export const STYLE_KEYS = Object.keys(ANNOUNCEMENT_STYLES) as AnnouncementStyle[];

export type AnnouncementDraft = { style: AnnouncementStyle; title: string; body: string };

/** Dịp trong năm (tháng gợi ý mặc định theo hôm nay). */
export const SEASONS = {
  khai_giang: { label: "Khai giảng năm học mới", months: [8, 9] },
  trung_thu: { label: "Trung thu", months: [9] },
  ngay_20_11: { label: "Ngày Nhà giáo 20/11", months: [11] },
  noel: { label: "Giáng sinh & cuối năm", months: [12] },
  tet: { label: "Tết Nguyên đán", months: [1, 2] },
  quoc_te_thieu_nhi: { label: "Quốc tế Thiếu nhi 1/6", months: [5, 6] },
  he: { label: "Khoá hè", months: [5, 6, 7] },
  vao_lop_1: { label: "Chuẩn bị vào lớp 1", months: [3, 4, 5, 6, 7] },
} as const;
export type Season = keyof typeof SEASONS;
export const SEASON_KEYS = Object.keys(SEASONS) as Season[];

export const COURSES = {
  tien_tieu_hoc: "Tiền tiểu học",
  toan_tu_duy: "Toán tư duy",
  luyen_chu: "Luyện chữ đẹp",
  tat_ca: "Tất cả các khoá",
} as const;
export type Course = keyof typeof COURSES;
export const COURSE_KEYS = Object.keys(COURSES) as Course[];

export const IDEA_KINDS = {
  su_kien: { label: "Sự kiện ngoại khoá", emoji: "🎪" },
  khuyen_mai: { label: "Khuyến mãi / khai giảng", emoji: "🎁" },
  tu_van: { label: "Kịch bản tư vấn tuyển sinh", emoji: "💬" },
} as const;
export type IdeaKind = keyof typeof IDEA_KINDS;
export const IDEA_KIND_KEYS = Object.keys(IDEA_KINDS) as IdeaKind[];

export type EventIdea = {
  name: string;
  goal: string;
  /** Các bước / kịch bản tổ chức */
  plan: string[];
  /** Ưu đãi gợi ý — số liệu để [trong ngoặc] cho quản trị tự điền */
  offer: string;
  /** Ý chính khi tư vấn phụ huynh */
  talkingPoints: string[];
  /** Ý chính để tạo thông báo từ ý tưởng này */
  announcementPoints: string;
};

/** Dịp gần nhất theo tháng hiện tại (gợi ý mặc định). */
export function seasonForMonth(month: number): Season {
  return SEASON_KEYS.find((k) => (SEASONS[k].months as readonly number[]).includes(month)) ?? "khai_giang";
}

/** Tách ý chính: mỗi dòng / dấu phẩy / chấm phẩy là 1 ý; bỏ gạch đầu dòng. */
export function splitPoints(text: string): string[] {
  return text
    .split(/\n|;|,(?![^(]*\))/)
    .map((s) => s.replace(/^\s*[-•*+]\s*/, "").trim())
    .filter((s) => s.length > 1);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** 3 văn phong soạn theo mẫu từ ý chính (khi chưa bật AI) — quản trị sửa lại trước khi đăng. */
export function templateDrafts(points: string[], categoryLabel: string): AnnouncementDraft[] {
  const first = points[0] ? cap(points[0]) : categoryLabel;
  const title = first.length > 80 ? `${first.slice(0, 79)}…` : first;
  const bullets = points.map((p) => `- ${cap(p)}`).join("\n");
  return [
    {
      style: "warm",
      title,
      body: `Kính gửi quý phụ huynh thân mến,\n\nTrung tâm TH EDU xin gửi tới gia đình thông tin sau:\n${bullets}\n\nCảm ơn ba mẹ đã luôn tin tưởng và đồng hành cùng các con và trung tâm. Chúc gia đình mình luôn mạnh khoẻ, vui vẻ! 💛`,
    },
    { style: "formal", title, body: `Trung tâm TH EDU trân trọng thông báo:\n${bullets}\n\nMọi thắc mắc xin liên hệ văn phòng cơ sở hoặc giáo viên chủ nhiệm. Trân trọng!` },
    { style: "social", title: `📣 ${title}`, body: `📣 THÔNG BÁO TỪ TH EDU 📣\n\n${points.map((p) => `✨ ${cap(p)}`).join("\n")}\n\n💬 Ba mẹ cần hỗ trợ cứ inbox/Zalo trung tâm nhé!\n#THEDU #TienTieuHoc #ToanTuDuy #LuyenChuDep` },
  ];
}

/** Thư viện ý tưởng có sẵn (khi chưa bật AI) — theo dịp + loại. */
export function templateIdeas(season: Season, course: Course, kind: IdeaKind): EventIdea[] {
  const s = SEASONS[season].label;
  const c = course === "tat_ca" ? "các khoá học" : `khoá ${COURSES[course]}`;
  const base: Record<IdeaKind, EventIdea[]> = {
    su_kien: [
      {
        name: `Ngày hội "Bé vui ${s}"`,
        goal: `Gắn kết phụ huynh – trung tâm, giới thiệu ${c} qua hoạt động trải nghiệm`,
        plan: ["Tuần 1: chốt chủ đề, chia trạm trò chơi theo môn", "Tuần 2: gửi thư mời phụ huynh + cho bé tập tiết mục", "Ngày hội: 4 trạm (đố vui toán, viết chữ đẹp, kể chuyện, vẽ tranh) — bé sưu tầm dấu", "Sau sự kiện: gửi ảnh, khảo sát phụ huynh"],
        offer: "Quà nhỏ cho bé đủ dấu 4 trạm; ưu đãi [..]% học phí khi đăng ký trong ngày hội",
        talkingPoints: ["Bé được trải nghiệm phương pháp học qua chơi", "Phụ huynh xem trực tiếp sự tiến bộ của con", "Lớp nhỏ, cô kèm sát từng bé"],
        announcementPoints: `Mời phụ huynh và các bé tham dự ngày hội "Bé vui ${s}"; thời gian [..], địa điểm [..]; 4 trạm trò chơi học tập; đăng ký với cô chủ nhiệm trước [..]`,
      },
    ],
    khuyen_mai: [
      {
        name: `Ưu đãi ${s} cho ${c}`,
        goal: "Tăng số học viên mới và giữ chân học viên cũ",
        plan: ["Chốt mức ưu đãi và thời hạn", "Đăng thông báo + bài Zalo/Facebook", "Mời học thử miễn phí 1 buổi", "Gọi lại phụ huynh đã học thử trong 48 giờ"],
        offer: "Giảm [..]% học phí khoá đầu; tặng bộ học liệu khi đăng ký trước [ngày]; giới thiệu bạn – cả hai cùng nhận ưu đãi [..]",
        talkingPoints: ["Ưu đãi có thời hạn — giữ chỗ sớm", "Học thử miễn phí trước khi đăng ký", "Cam kết theo dõi tiến bộ qua Sổ liên lạc điện tử hằng ngày"],
        announcementPoints: `Chương trình ưu đãi ${s} cho ${c}; giảm [..]% học phí khoá đầu; học thử miễn phí 1 buổi; áp dụng đến hết [ngày]`,
      },
    ],
    tu_van: [
      {
        name: `Kịch bản tư vấn ${c} mùa ${s}`,
        goal: "Hiểu nhu cầu phụ huynh và chốt lịch học thử",
        plan: ["Chào hỏi, hỏi tuổi và tình hình học của bé", "Lắng nghe điều phụ huynh lo lắng (chữ xấu, chưa tập trung, sợ vào lớp 1…)", "Giới thiệu khoá phù hợp + phương pháp + sổ liên lạc điện tử", "Mời học thử, chốt thời gian cụ thể"],
        offer: "Học thử miễn phí 1 buổi; ưu đãi [..] khi đăng ký trong tuần",
        talkingPoints: ["Lộ trình rõ ràng theo từng tháng", "Phụ huynh xem nhận xét, ảnh, điểm danh của con mỗi ngày trên app", "Lớp sĩ số nhỏ, giáo viên chuyên môn"],
        announcementPoints: `Tuyển sinh ${c}; học thử miễn phí 1 buổi; lịch học Thứ 2 – Thứ 7, 18:00 – 19:30; đăng ký qua hotline / Zalo trung tâm`,
      },
    ],
  };
  return base[kind];
}
