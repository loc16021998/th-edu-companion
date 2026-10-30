# Triển khai Production — TH EDU Companion (Vercel + Supabase)

## 1. Quy trình CI/CD

```
Nhánh tính năng ──push──▶ GitHub Actions "Tests" (tsc · ESLint 0 cảnh báo · Jest · E2E nếu có secret staging)
        │                 Vercel tạo bản Preview riêng cho Pull Request (URL *.vercel.app)
        ▼
Pull Request ──(Tests xanh + duyệt)──▶ merge vào main ──▶ Vercel build & deploy Production (app.thedu.edu.vn)
```

Thiết lập (1 lần):
1. Đưa code lên GitHub (repo **private**).
2. Vercel → **Add New Project** → chọn repo. Framework *Next.js* tự nhận; Build Command `npm run build`, Install Command `npm ci` (mặc định).
3. GitHub → Settings → **Branches → Branch protection** cho `main`: bật *Require a pull request* + *Require status checks to pass* → chọn `unit` (workflow `Tests`). Không ai đẩy thẳng code chưa qua kiểm thử lên production.
4. Vercel → Settings → **Git → Production Branch** = `main`.

`npm run build` trên Vercel tự chạy:

| Bước | Lệnh | Dừng build khi |
|---|---|---|
| `prebuild` | `scripts/check-env.mjs` | thiếu biến bắt buộc; biến bí mật mang tiền tố `NEXT_PUBLIC_`; khoá anon thực chất là service_role; URL Supabase không phải https |
| `build` | `next build` | lỗi TypeScript, lỗi ESLint |
| `postbuild` | `scripts/check-env.mjs --scan-build` | **giá trị** của bất kỳ biến bí mật nào xuất hiện trong JS / CSS gửi xuống trình duyệt |

Quay lui khi bản mới lỗi: Vercel → **Deployments** → bản trước → **Promote to Production** (≈ 1 phút, không cần build lại).

## 2. Biến môi trường

Mẫu đầy đủ, chia nhóm: [`.env.production.example`](../.env.production.example). Đặt giá trị thật ở **Vercel → Settings → Environment Variables**:

| Nhóm | Biến | Ở đâu |
|---|---|---|
| Công khai | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Nhúng vào JS trình duyệt — chỉ giá trị không bí mật. Khoá anon an toàn vì dữ liệu được RLS bảo vệ |
| Chỉ server | `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, `*_SECRET`, `ANTHROPIC_API_KEY`, `UPSTASH_REDIS_REST_TOKEN`, `SENTRY_DSN`… | Không tiền tố `NEXT_PUBLIC_` → Next.js không đưa xuống trình duyệt; module dùng chúng có `import "server-only"` |

- Tick **Sensitive** cho mọi biến nhóm "chỉ server" (Vercel không cho xem lại giá trị sau khi lưu).
- Môi trường **Preview** nên dùng project Supabase **thử nghiệm** (khác production) — bản preview của Pull Request không chạm dữ liệu thật.
- Không commit file `.env*` chứa giá trị (`.gitignore` chỉ cho phép `*.example`).
- Kiểm tra trên máy: `npm run check:env` (không in giá trị khoá).
- Lộ khoá service_role → Supabase → API Keys → **tạo khoá mới / thu hồi khoá cũ** → cập nhật Vercel → Redeploy.

## 3. Tên miền riêng `app.thedu.edu.vn` + HTTPS

1. Vercel → Project → **Settings → Domains → Add** → `app.thedu.edu.vn`.
2. Tại nhà đăng ký tên miền `.edu.vn` (Mắt Bão, PA Việt Nam, Nhân Hòa…), vào quản lý DNS của `thedu.edu.vn`, thêm bản ghi đúng như Vercel hiển thị, thường là:

   | Loại | Tên | Giá trị |
   |---|---|---|
   | CNAME | `app` | `cname.vercel-dns.com` |

   (Nếu Vercel yêu cầu xác minh quyền sở hữu, thêm bản ghi `TXT` `_vercel` theo hướng dẫn.)
3. Chờ DNS cập nhật (vài phút → vài giờ). Vercel **tự cấp và tự gia hạn chứng chỉ SSL** (Let's Encrypt) — không cần mua / cài chứng chỉ thủ công. Trạng thái "Valid Configuration" màu xanh là xong.
4. Settings → Domains: đặt `app.thedu.edu.vn` làm tên miền chính, cấu hình tên miền `*.vercel.app` **Redirect** về nó.
5. Sau khi tên miền chạy:
   - Supabase → **Authentication → URL Configuration**: *Site URL* = `https://app.thedu.edu.vn`, thêm `https://app.thedu.edu.vn/**` vào *Redirect URLs*.
   - Admin → **Cài đặt thông báo** → kết nối tự động gửi với URL `https://app.thedu.edu.vn`.
   - Máy giám sát uptime + workflow sao lưu: đổi URL sang tên miền mới (`/api/health`).
6. Kiểm tra: `https://www.ssllabs.com/ssltest/analyze.html?d=app.thedu.edu.vn` (mục tiêu A/A+) và `https://securityheaders.com/?q=app.thedu.edu.vn`.

Mọi kết nối HTTP tự chuyển sang HTTPS (Vercel) và trình duyệt được yêu cầu chỉ dùng HTTPS trong 2 năm (header HSTS).

### Hiệu năng: đặt máy chủ gần database
Vercel mặc định chạy hàm ở Mỹ (`iad1`). Xem vùng của Supabase (Settings → General → Region), rồi Vercel → Settings → **Functions → Function Region** chọn vùng gần nhất — vd. Supabase `ap-southeast-1` (Singapore) → Vercel `sin1`. Mỗi trang gọi database nhiều lần; cùng vùng giảm hàng trăm ms / trang.

## 3b. Tác vụ định kỳ (Vercel Cron — `vercel.json`)

| Lịch | Đường dẫn | Việc |
|---|---|---|
| `0 13 * * 0` (Chủ nhật 20:00 giờ VN) | `/api/cron/weekly-report` | Báo cáo doanh thu & sĩ số tuần → Bảng tin hoạt động của quản trị viên (+ email nếu đặt `RESEND_API_KEY`, `REPORT_EMAIL_FROM`) |

- Vercel tự gửi `Authorization: Bearer <CRON_SECRET>` → **bắt buộc đặt biến `CRON_SECRET`** (≥ 32 ký tự) trên Vercel, nếu không route trả 401.
- Chạy thử: `curl -H "Authorization: Bearer <CRON_SECRET>" https://app.thedu.edu.vn/api/cron/weekly-report` — chạy lại cùng tuần không tạo trùng, không gửi lại email.
- Email qua [Resend](https://resend.com): xác minh tên miền gửi (vd. `bao-cao@thedu.edu.vn`) trong Resend → đặt `REPORT_EMAIL_FROM`.

## 4. Header bảo mật

| Header | Giá trị | Chống |
|---|---|---|
| `Content-Security-Policy` | nonce ngẫu nhiên mỗi lượt tải, `strict-dynamic`, chỉ cho phép Supabase của project, `frame-ancestors 'none'`, `object-src 'none'` — `src/lib/security/csp.ts`, gắn ở `src/middleware.ts` | XSS, chèn script, rò dữ liệu ra tên miền lạ, clickjacking |
| `X-Frame-Options` | `DENY` | Clickjacking (trình duyệt cũ) |
| `X-Content-Type-Options` | `nosniff` | Đoán sai loại file → chạy mã |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | Hạ cấp xuống HTTP, đánh cắp phiên trên Wi-Fi công cộng |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Lộ đường dẫn (có id học sinh) sang trang khác |
| `Cross-Origin-Opener-Policy` | `same-origin` | Trang ngoài (mở từ link) điều khiển cửa sổ app |
| `Permissions-Policy` | camera / micro chỉ trong app, tắt định vị | Trang nhúng lạm dụng quyền thiết bị |

Đã kiểm tra trên Chrome (bản production): mọi script của Next.js mang nonce, Realtime / ảnh QR / ảnh xem trước hoạt động, **0 vi phạm CSP**; mô phỏng HTML bị chèn `<script>` và `onerror=` → **không chạy**; gửi dữ liệu ra tên miền lạ (fetch / ảnh) và nhúng app vào iframe → **bị chặn**.

Vi phạm CSP được trình duyệt gửi về `/api/csp-report` → hiện ở **Admin → Giám sát hệ thống**. Thêm dịch vụ bên ngoài mới (vd. bản đồ, analytics) → thêm nguồn đó vào `src/lib/security/csp.ts`, nếu không trình duyệt sẽ chặn.

Lưu ý: CSP theo nonce cần HTML mới mỗi lượt tải → mọi trang render động (root layout gọi `connection()`); trang của app vốn đã động vì cần đăng nhập nên không ảnh hưởng đáng kể.

## 5. Checklist trước khi mở cho phụ huynh
- [ ] Đã chạy toàn bộ `supabase/apply-*.sql` trên project production; `supabase/tests/rls-isolation.sql` đạt.
- [ ] Biến môi trường Production đủ, biến bí mật tick *Sensitive*; build trên Vercel xanh (gồm `prebuild` / `postbuild`).
- [ ] `https://app.thedu.edu.vn` có SSL hợp lệ; `*.vercel.app` chuyển hướng về tên miền chính.
- [ ] Supabase Auth Site URL / Redirect URLs = tên miền mới.
- [ ] `/api/health` trả `ok`; máy giám sát uptime đang chạy.
- [ ] Sao lưu: gói Supabase Pro (+ PITR nếu được), workflow `db-backup` chạy thử thành công.
- [ ] Đăng nhập thử bằng tài khoản phụ huynh / giáo viên trên điện thoại thật (iPhone + Android), thêm vào Màn hình chính, bật thông báo.
