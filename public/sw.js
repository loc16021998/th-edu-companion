// Service worker TH EDU Companion.
//
// OFFLINE: phụ huynh / giáo viên mất mạng vẫn mở lại được các trang đã xem (nhận xét, điểm danh, lịch…) và ảnh đã tải.
//   - Trang /parent/*, /teacher/*: đã từng mở → hiện NGAY bản đã lưu, tải bản mới ngầm và trang tự cập nhật dữ liệu
//     (StalePageRefresh); chưa có bản lưu / quá 3 ngày → mạng trước; mất mạng → bản đã lưu gần nhất.
//   - Ảnh qua bộ tối ưu Next (/_next/image): cache-first theo ĐƯỜNG DẪN ảnh (bỏ token ký hết hạn) — ảnh không đổi theo đường dẫn.
//   - APP SHELL (cache-first, mở app từ màn hình chính không chờ mạng): JS/CSS/font build có hash (/_next/static),
//     icon, logo TH EDU (/brand, kể cả bản đã tối ưu qua /_next/image), manifest — lưu sẵn ngay khi cài service worker.
//   - Navigation Preload: tải trang song song lúc service worker khởi động (điện thoại mất 50–300ms để khởi động SW).
// RIÊNG TƯ: bản lưu trang/ảnh chỉ nằm trên máy người dùng và bị XOÁ khi đăng xuất (mở trang đăng nhập)
// hoặc khi app gửi lệnh CLEAR_USER_CACHE. Không lưu trang quản trị, API, Server Action.

// v8: chỉ cache-first file build CÓ HASH trong tên — file dev (`layout.js`, `webpack.js`) đổi nội dung mà giữ tên
//     → trước đây bị lưu vĩnh viễn, trình duyệt chạy JS cũ → lỗi hydration. Đổi phiên bản = xoá cache static v7.
// v9: lệnh CLEAR_PAGES_CACHE — phụ huynh đổi bé đang xem → bỏ trang đã lưu của bé cũ (trang lưu theo URL, không theo cookie).
const VERSION = "v9";
const STATIC_CACHE = `th-edu-static-${VERSION}`;
const PAGES_CACHE = "th-edu-pages";
const MEDIA_CACHE = "th-edu-media";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-48.png",
  "/brand/th-edu-watermark-720.png",
];
const MAX_PAGES = 60;
const MAX_MEDIA = 200;
const MAX_STATIC = 400;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("th-edu-static-") && k !== STATIC_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      // Trình duyệt gửi request trang ngay, không đợi service worker khởi động xong
      .then(() => self.registration.navigationPreload?.enable())
      .then(() => self.clients.claim()),
  );
});

/** Response trang: dùng bản đã tải sẵn (navigation preload) nếu có, ngược lại gọi mạng. */
async function fetchNavigation(event) {
  const preloaded = await event.preloadResponse;
  return preloaded ?? fetch(event.request);
}

/** App shell bất biến (đường dẫn có hash / ảnh tĩnh): cache trước, chưa có thì tải và lưu. */
async function staticCacheFirst(request) {
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.put(request, copy))
      .then(() => trim(STATIC_CACHE, MAX_STATIC));
  }
  return response;
}

/** Trả ngay bản đã lưu, đồng thời cập nhật ngầm cho lần sau (manifest). */
async function staleWhileRevalidate(event) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(event.request);
  const network = fetch(event.request)
    .then((response) => {
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    })
    .catch(() => cached);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  return network;
}

function clearUserCaches() {
  return Promise.all([caches.delete(PAGES_CACHE), caches.delete(MEDIA_CACHE)]);
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CLEAR_USER_CACHE") event.waitUntil(clearUserCaches());
  // Đổi bé đang xem: trang /parent/* đã lưu thuộc bé cũ → xoá để lần mở sau không hiện thông tin bé khác. Ảnh giữ lại.
  if (event.data && event.data.type === "CLEAR_PAGES_CACHE") event.waitUntil(caches.delete(PAGES_CACHE));
});

/** Giữ cache gọn: xoá bản cũ nhất khi vượt giới hạn. */
async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

/**
 * File build bất biến: tên có hash (`page-5f66605c0207ca06.js`, `css/0123abcd4567ef89.css`, font `569ce4b8f30dc480-s.p.woff2`)
 * hoặc nằm trong thư mục buildId (`/_next/static/AFIic2bVG4J-CYOpyqkA8/_buildManifest.js`).
 */
const isImmutableBuildAsset = (url) =>
  url.pathname.startsWith("/_next/static/") &&
  (/[/\-.~_][0-9a-f]{8,}[^/]*\.(js|css|woff2?|ttf|otf|png|svg|jpg|webp)$/i.test(url.pathname) || /^\/_next\/static\/[A-Za-z0-9_-]{15,}\//.test(url.pathname));

const isUserPage = (url) => /^\/(parent|teacher)(\/|$)/.test(url.pathname);
const isLoginPage = (url) => url.pathname === "/login" || url.pathname.startsWith("/login/") || url.pathname === "/admin/login";

/** Khoá cache ảnh: đường dẫn ảnh gốc (bỏ token ký) + độ rộng → token đổi mỗi giờ vẫn dùng lại được. */
function mediaKey(url) {
  const inner = url.searchParams.get("url");
  if (!inner) return null;
  try {
    const src = new URL(inner, self.location.origin);
    if (!src.pathname.startsWith("/storage/v1/")) return null;
    const path = src.pathname.replace("/storage/v1/object/sign/", "/storage/v1/object/");
    return `${self.location.origin}/__media${path}?w=${url.searchParams.get("w") || ""}`;
  } catch {
    return null;
  }
}

/** Lưu trang kèm thời điểm lưu (header x-th-cached-at) — chỉ trang hiển thị bình thường, không lưu redirect / lỗi. */
async function putPage(cache, request, response) {
  if (!response.ok || response.type !== "basic" || response.redirected) return;
  const headers = new Headers(response.headers);
  headers.set("x-th-cached-at", String(Date.now()));
  const body = await response.blob();
  await cache.put(request, new Response(body, { status: response.status, statusText: response.statusText, headers }));
  await trim(PAGES_CACHE, MAX_PAGES);
}

/**
 * Đánh dấu HTML là "bản đã lưu": chèn <meta name="th-sw-stale" content="thời điểm lưu"> vào <head>.
 * Component StalePageRefresh thấy thẻ này → tải dữ liệu mới (router.refresh) + hiện "Đang cập nhật…".
 * (React 19 bỏ qua thẻ lạ trong <head> khi hydrate → không lỗi.)
 */
async function markStale(cached) {
  const at = cached.headers.get("x-th-cached-at") || "0";
  const html = await cached.text();
  const headers = new Headers(cached.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.set("cache-control", "no-store");
  return new Response(html.replace("<head>", `<head><meta name="th-sw-stale" content="${at}">`), { status: 200, headers });
}

async function pageNetworkFirst(event) {
  const { request } = event;
  const cache = await caches.open(PAGES_CACHE);
  try {
    const response = await fetchNavigation(event);
    event.waitUntil(putPage(cache, request, response.clone()));
    return response;
  } catch {
    const exact = await cache.match(request, { ignoreVary: true });
    if (exact) return markStale(exact);
    // Cùng trang nhưng khác tham số (vd. ngày khác) → bản gần nhất của trang đó
    const url = new URL(request.url);
    const keys = await cache.keys();
    const samePath = keys.reverse().find((k) => new URL(k.url).pathname === url.pathname);
    if (samePath) return markStale(await cache.match(samePath, { ignoreVary: true }));
    return (await caches.match(OFFLINE_URL)) ?? Response.error();
  }
}

/**
 * MỞ APP TỨC THÌ: trang đã từng mở → trả ngay bản đã lưu (không chờ mạng 4G), đồng thời tải bản mới để lưu cho
 * lần sau; trên trang, StalePageRefresh lấy dữ liệu mới nhất và thay vào sau vài giây.
 * Đi mạng như cũ khi: chưa có bản lưu, bản lưu quá STALE_MAX_AGE, hoặc trang vừa được trả bản lưu < 15 giây trước
 * (tải lại ngay sau đó, vd. app vừa cập nhật phiên bản mới → tránh vòng lặp hiện bản cũ).
 */
const STALE_MAX_AGE = 3 * 24 * 60 * 60 * 1000;
const STALE_LOOP_GUARD = 15 * 1000;
const servedStaleAt = new Map();

async function pageStaleWhileRevalidate(event) {
  const { request } = event;
  const cache = await caches.open(PAGES_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  const cachedAt = cached ? Number(cached.headers.get("x-th-cached-at") || 0) : 0;
  const now = Date.now();
  const last = servedStaleAt.get(request.url) || 0;
  if (!cached || now - cachedAt > STALE_MAX_AGE || now - last < STALE_LOOP_GUARD) {
    return pageNetworkFirst(event);
  }
  servedStaleAt.set(request.url, now);
  if (servedStaleAt.size > 100) servedStaleAt.delete(servedStaleAt.keys().next().value);
  // Cập nhật bản lưu cho lần mở sau (dùng luôn request đã tải sẵn của Navigation Preload)
  event.waitUntil(
    fetchNavigation(event)
      .then((response) => putPage(cache, request, response))
      .catch(() => undefined),
  );
  return markStale(cached);
}

async function mediaCacheFirst(request, key) {
  const cache = await caches.open(MEDIA_CACHE);
  const cached = await cache.match(key);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(key, response.clone()).then(() => trim(MEDIA_CACHE, MAX_MEDIA));
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase API/Storage: để trình duyệt xử lý

  if (request.mode === "navigate") {
    // Mở trang đăng nhập (đăng xuất / đổi tài khoản) → xoá dữ liệu đã lưu của người trước
    if (isLoginPage(url)) {
      event.waitUntil(clearUserCaches());
      event.respondWith(fetchNavigation(event).catch(() => caches.match(OFFLINE_URL).then((r) => r ?? Response.error())));
      return;
    }
    if (isUserPage(url)) {
      event.respondWith(pageStaleWhileRevalidate(event));
      return;
    }
    // Trang khác: mạng; mất mạng → trang offline thân thiện
    event.respondWith(fetchNavigation(event).catch(() => caches.match(OFFLINE_URL).then((r) => r ?? Response.error())));
    return;
  }

  if (url.pathname === "/_next/image") {
    const inner = url.searchParams.get("url") || "";
    // Logo / ảnh tĩnh của app (đường dẫn nội bộ, không đổi) → app shell
    if (inner.startsWith("/") && !inner.startsWith("//")) {
      event.respondWith(staticCacheFirst(request));
      return;
    }
    const key = mediaKey(url);
    if (key) event.respondWith(mediaCacheFirst(request, key));
    return;
  }

  if (url.pathname === "/manifest.webmanifest") {
    event.respondWith(staleWhileRevalidate(event));
    return;
  }

  // Tài nguyên build có hash (JS, CSS, font) + icon + logo → bất biến, cache-first.
  // /_next/static KHÔNG có hash (chế độ dev) → để mạng xử lý, không bao giờ lưu.
  if (isImmutableBuildAsset(url) || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/brand/")) {
    event.respondWith(staticCacheFirst(request));
  }
});

// ----------------------------------------------------------------------------- Web Push
// Payload JSON từ server: { title, body, url, tag }. Không chứa dữ liệu nhạy cảm ngoài tiêu đề/tóm tắt.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "TH EDU Companion", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "TH EDU Companion";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/" },
      lang: "vi",
    }),
  );
});

// Chạm thông báo → mở (hoặc chuyển tới) đúng trang trong app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === target.origin && "focus" in client) {
          return client.focus().then((c) => (c && "navigate" in c ? c.navigate(target.href) : undefined));
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
