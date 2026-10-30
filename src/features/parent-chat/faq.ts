// Trả lời tự động soạn sẵn theo từ khoá — dùng khi chưa cấu hình trợ lý AI (ANTHROPIC_API_KEY)
// hoặc AI tạm lỗi. Module thuần, không gọi mạng.
import { CAMPUS_LABELS, ORGANIZATION, SUBJECTS } from "@/config/constants";
import { SCHEDULE_LABEL } from "@/lib/schedule";

const HOTLINE = ORGANIZATION.phones.map((p) => p.display).join(" hoặc ");
const ADDRESSES = ORGANIZATION.campuses.map((c) => `- ${c.label}: ${c.address}`).join("\n");

export const HANDOFF_HINT = `Anh/chị cần trao đổi trực tiếp với tư vấn viên, vui lòng bấm "Chat Zalo" hoặc gọi hotline ${HOTLINE} ạ.`;

/** Bỏ dấu tiếng Việt + chữ thường để so khớp từ khoá ("Học phí" ~ "hoc phi"). */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const RULES: { keywords: string[]; answer: string }[] = [
  {
    keywords: ["lich hoc", "gio hoc", "may gio", "thoi gian", "thu may", "buoi hoc", "chu nhat", "lich"],
    answer: `Lịch học cố định của trung tâm: ${SCHEDULE_LABEL} (giờ Việt Nam), Chủ nhật nghỉ. Ngày lễ, Tết nhà trường sẽ thông báo lịch nghỉ trước ạ.\nPhụ huynh đã có tài khoản xem lịch từng tuần của con ở tab "Lịch học".`,
  },
  {
    keywords: ["dia chi", "co so", "o dau", "xa la", "ngo thi nham", "duong", "chi duong"],
    answer: `${ORGANIZATION.name} có 2 cơ sở:\n${ADDRESSES}`,
  },
  {
    keywords: ["so dien thoai", "sdt", "hotline", "lien he", "goi", "zalo", "tu van vien", "gap nguoi"],
    answer: `Anh/chị liên hệ trung tâm qua hotline ${HOTLINE}, hoặc bấm nút "Chat Zalo" ở góc màn hình để nhắn tin trực tiếp với tư vấn viên ạ.`,
  },
  {
    keywords: ["hoc phi", "dong tien", "chuyen khoan", "bao nhieu tien", "chi phi", "thanh toan", "no hoc phi"],
    answer: `Các khoản học phí của con hiển thị ở tab "Học phí" (số tiền, đã đóng, hạn đóng). Sau khi chuyển khoản, trạng thái được cập nhật khi nhà trường xác nhận.\nĐể biết mức học phí và thông tin chuyển khoản, anh/chị vui lòng liên hệ văn phòng cơ sở hoặc hotline ${HOTLINE} ạ.`,
  },
  {
    keywords: ["tai khoan", "dang nhap", "mat khau", "quen", "dang ky tai khoan", "tao tai khoan", "khong vao duoc"],
    answer: `Tài khoản phụ huynh do nhà trường cấp (đăng nhập bằng số điện thoại hoặc email). Phụ huynh đăng nhập tại trang "Đăng nhập Phụ huynh".\nĐã đăng nhập có thể tự đổi mật khẩu bằng biểu tượng 🔑 trên đầu trang. Quên mật khẩu hoặc chưa có tài khoản, anh/chị liên hệ hotline ${HOTLINE} để được cấp lại ạ.`,
  },
  {
    keywords: ["xin nghi", "nghi hoc", "cho con nghi", "bao nghi", "bi om", "vang mat"],
    answer: `Để xin cho con nghỉ, anh/chị vui lòng báo giáo viên chủ nhiệm hoặc nhắn "Chat Zalo" / gọi hotline ${HOTLINE} trước buổi học ạ. Tình hình đi học của con xem ở tab "Chuyên cần".`,
  },
  {
    keywords: ["mon hoc", "hoc gi", "chuong trinh", "tien tieu hoc", "luyen chu", "toan tu duy", "mon"],
    answer: `Trung tâm có các môn: ${Object.values(SUBJECTS).join(", ")}. Sau mỗi buổi giáo viên đánh giá từng môn (1–5 sao) và nhận xét trong sổ liên lạc — phụ huynh xem ở tab "Học tập".`,
  },
  {
    keywords: ["dang ky hoc", "tuyen sinh", "hoc thu", "nhap hoc", "dang ky cho con", "con muon hoc", "lop moi"],
    answer: `Để đăng ký học / học thử, anh/chị vui lòng để lại tin nhắn qua "Chat Zalo" hoặc gọi hotline ${HOTLINE}, tư vấn viên sẽ liên hệ xếp lớp phù hợp ở cơ sở ${Object.values(CAMPUS_LABELS).join(" hoặc ")} ạ.`,
  },
  {
    keywords: ["nhan xet", "so lien lac", "diem danh", "con hoc", "tinh hinh", "tam trang", "hinh anh", "video"],
    answer: `Nhận xét, đánh giá các môn, tâm trạng và ảnh/video của con sau mỗi buổi xem ở tab "Học tập"; điểm danh xem ở tab "Chuyên cần". Khi giáo viên cập nhật, anh/chị sẽ nhận thông báo ở biểu tượng chuông 🔔.`,
  },
  {
    keywords: ["cai app", "ung dung", "man hinh chinh", "tai app", "dien thoai"],
    answer: `Anh/chị có thể thêm ứng dụng vào màn hình điện thoại: iPhone mở bằng Safari → Chia sẻ → "Thêm vào MH chính"; Android mở bằng Chrome → menu → "Cài đặt ứng dụng".`,
  },
  {
    keywords: ["xin chao", "chao", "hello", "hi", "alo"],
    answer: `Em chào anh/chị ạ 👋 Em có thể giải đáp về lịch học, địa chỉ cơ sở, học phí, tài khoản đăng nhập, cách xem nhận xét và chuyên cần của con. Anh/chị cần hỏi gì ạ?`,
  },
];

const TEACHER_HANDOFF = `Thầy/cô cần trao đổi với quản trị viên trung tâm, vui lòng bấm "Chat Zalo" hoặc gọi hotline ${HOTLINE} ạ.`;

/** Câu hỏi thường gặp của GIÁO VIÊN (thao tác trong ứng dụng). Được ưu tiên trước bộ chung khi audience = "teacher". */
const TEACHER_RULES: { keywords: string[]; answer: string }[] = [
  {
    keywords: ["diem danh", "co mat", "di muon", "vang", "nghi hoc", "luu diem danh", "sua diem danh"],
    answer: `Cách điểm danh: mở tab "Điểm danh" → chọn lớp và ngày (Chủ nhật không có buổi học) → mặc định tất cả "Có mặt", chạm để đổi "Đi muộn" / "Vắng" và nhập lý do → bấm "Lưu điểm danh". Phụ huynh nhận thông báo ngay khi lưu; sửa lại thì chỉ cần lưu lần nữa ạ.`,
  },
  {
    keywords: ["so lien lac", "nhan xet", "danh gia", "cham sao", "tam trang", "viet so", "ca lop"],
    answer: `Cách viết sổ liên lạc: mở tab "Sổ liên lạc" → chọn lớp, ngày, rồi chọn học sinh → chọn tâm trạng, chấm sao 1–5 từng môn, viết nhận xét (có câu mẫu chạm-để-chèn) → bấm "Lưu". Có thể tick "Áp dụng nhận xét chung cho cả lớp" để ghi nhanh cho các bạn chưa có nhận xét; sau khi lưu, nút "Bạn tiếp theo" đưa thầy/cô sang học sinh kế tiếp ạ.`,
  },
  {
    keywords: ["video", "tai anh", "them anh", "upload", "hinh anh", "chup anh", "tai len"],
    answer: `Thêm ảnh/video trong sổ liên lạc: bấm "Chụp ảnh" hoặc "Thư viện" → ảnh tự nén trước khi tải, video tối đa 50MB, tối đa 20 file/học sinh/ngày. Mạng yếu hoặc mất mạng thì ứng dụng tự tải tiếp khi có mạng lại; file lỗi chạm vào để thử lại. Đợi tải xong rồi mới bấm "Lưu" ạ.`,
  },
  {
    keywords: ["ca hoc", "lich day", "lop phu trach", "phan cong", "doi lop", "them hoc sinh", "cham cong"],
    answer: `Ca học, lớp phụ trách, danh sách học sinh và chấm công giáo viên do quản trị viên trung tâm quản lý. Thầy/cô cần thay đổi, vui lòng báo quản trị viên ạ.`,
  },
  {
    keywords: ["mat khau", "doi mat khau", "quen mat khau", "dang nhap", "tai khoan"],
    answer: `Đổi mật khẩu: bấm biểu tượng 🔑 trên đầu trang → nhập mật khẩu hiện tại và mật khẩu mới. Quên mật khẩu thì quản trị viên trung tâm sẽ cấp lại mật khẩu mới cho thầy/cô ạ.`,
  },
  {
    keywords: ["xin chao", "chao", "hello", "hi", "alo"],
    answer: `Em chào thầy/cô ạ 👋 Em có thể hướng dẫn cách điểm danh, viết sổ liên lạc, thêm ảnh/video, đổi mật khẩu. Thầy/cô cần hỏi gì ạ?`,
  },
];

function bestMatch(q: string, rules: { keywords: string[]; answer: string }[]) {
  let best: { score: number; answer: string } | null = null;
  for (const rule of rules) {
    const score = rule.keywords.reduce((sum, k) => sum + (q.includes(` ${k} `) ? k.length : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { score, answer: rule.answer };
  }
  return best;
}

/**
 * Câu trả lời tự động phù hợp nhất; không khớp → hướng dẫn gặp tư vấn viên.
 * `audience` = "teacher": ưu tiên câu hỏi thường gặp của giáo viên, rồi mới tới bộ chung (lịch, địa chỉ, hotline...).
 */
export function faqAnswer(question: string, audience: "public" | "teacher" = "public"): string {
  const q = ` ${normalize(question)} `; // so khớp nguyên từ: " hoc phi " không khớp trong " hoc phiếu "
  const handoff = audience === "teacher" ? TEACHER_HANDOFF : HANDOFF_HINT;
  const best = (audience === "teacher" ? bestMatch(q, TEACHER_RULES) : null) ?? bestMatch(q, RULES);
  return best ? `${best.answer}\n\n${handoff}` : `Em chưa có câu trả lời sẵn cho câu hỏi này. ${handoff}`;
}

/** Trả câu trả lời dạng stream chữ (cùng định dạng với trợ lý AI) cho giao diện chat. */
export function faqResponse(question: string, audience: "public" | "teacher" = "public"): Response {
  return new Response(faqAnswer(question, audience), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
