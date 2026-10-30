// Sinh logo + bộ icon PWA từ ảnh logo gốc của trung tâm (assets/brand/th-edu-logo-source.jpg).
// Chạy lại khi đổi logo:  node scripts/generate-pwa-icons.mjs
// sharp có sẵn trong node_modules (dependency tuỳ chọn của Next.js).
import { mkdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(root, "assets/brand/th-edu-logo-source.jpg");
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

async function out(file, pipeline) {
  const target = join(root, file);
  await mkdir(dirname(target), { recursive: true });
  await pipeline.toFile(target);
  console.log("✓", file);
}

/** Tìm vùng có nét (không trắng) theo hàng → tách biểu tượng (khối trên) và chữ "TH EDU" (khối dưới). */
async function findBands() {
  const { data, info } = await sharp(SOURCE).greyscale().raw().toBuffer({ resolveWithObject: true });
  const bands = [];
  let start = -1;
  for (let y = 0; y < info.height; y++) {
    let ink = false;
    for (let x = 0; x < info.width && !ink; x++) ink = data[y * info.width + x] < 200;
    if (ink && start < 0) start = y;
    if (!ink && start >= 0) {
      bands.push([start, y - 1]);
      start = -1;
    }
  }
  if (bands.length < 2) throw new Error("Không tách được biểu tượng và chữ trong logo");
  return { width: info.width, mark: bands[0], text: bands[bands.length - 1] };
}

const { width, mark, text } = await findBands();
const pad = 8;

// Biểu tượng (không chữ) — dùng ở header, icon
/** Cắt theo hàng rồi xén viền trắng (2 bước — sharp không cho extract + trim trong cùng pipeline). */
async function cropBand(top, bottom) {
  const band = await sharp(SOURCE).extract({ left: 0, top, width, height: bottom - top + 1 }).toBuffer();
  return sharp(band).trim({ threshold: 40 }).toBuffer();
}

const markBuffer = await cropBand(mark[0] - pad, mark[1] + pad);

// Logo đầy đủ (biểu tượng + chữ TH EDU) — dùng ở trang đăng nhập
const fullBuffer = await cropBand(mark[0] - pad, text[1] + pad);

/**
 * Tách nền trắng → trong suốt. Độ "xa màu trắng" của pixel = max(255 - R, 255 - G, 255 - B):
 *  < 12 (nền + nhiễu JPEG) → trong suốt; > 70 (thân logo) → đục hoàn toàn; ở giữa (viền) → bán trong suốt,
 * đồng thời khử pha trắng ở viền để không còn quầng trắng khi đặt trên nền màu.
 */
async function removeWhiteBackground(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const LO = 12;
  const HI = 70;
  for (let i = 0; i < data.length; i += 4) {
    const dist = Math.max(255 - data[i], 255 - data[i + 1], 255 - data[i + 2]);
    const alpha = Math.min(1, Math.max(0, (dist - LO) / (HI - LO)));
    if (alpha > 0 && alpha < 1) {
      for (let c = 0; c < 3; c++) data[i + c] = Math.max(0, Math.min(255, Math.round(255 - (255 - data[i + c]) / alpha)));
    }
    data[i + 3] = Math.round(alpha * 255);
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

const markTransparent = await removeWhiteBackground(markBuffer);
const fullTransparent = await removeWhiteBackground(fullBuffer);

// Logo nền trong suốt — dùng trong giao diện
await out("public/brand/th-edu-logo.png", sharp(fullTransparent).resize({ width: 720 }).png({ compressionLevel: 9 }));
await out("public/brand/th-edu-mark.png", sharp(markTransparent).resize({ width: 480 }).png({ compressionLevel: 9 }));
// Ảnh nền mờ (watermark) cho trang quản trị / phụ huynh / giáo viên — độ phân giải cao để phóng to vẫn nét
await out("public/brand/th-edu-watermark.png", sharp(fullTransparent).resize({ width: 1400, withoutEnlargement: true }).png({ compressionLevel: 9 }));

/**
 * Icon app vuông, biểu tượng ở giữa chiếm `scale` chiều rộng. Giữ NỀN TRẮNG vì iOS/Android tô đen nền trong suốt
 * của icon màn hình chính.
 */
async function squareIcon(size, scale) {
  const inner = Math.round(size * scale);
  const logo = await sharp(markBuffer).resize({ width: inner, height: inner, fit: "inside" }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9 });
}

await out("public/icons/icon-192.png", await squareIcon(192, 0.84));
await out("public/icons/icon-512.png", await squareIcon(512, 0.84));
// Maskable: vùng an toàn là hình tròn 80% → biểu tượng nhỏ hơn
await out("public/icons/icon-maskable-512.png", await squareIcon(512, 0.62));
// iOS tự bo góc; chừa lề vừa phải
await out("public/icons/apple-touch-icon.png", await squareIcon(180, 0.8));
// Favicon tab trình duyệt
const faviconLogo = await sharp(markTransparent).resize({ width: 46, height: 46, fit: "inside" }).toBuffer();
await out(
  "public/icons/favicon-48.png",
  sharp({ create: { width: 48, height: 48, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: faviconLogo, gravity: "center" }])
    .png({ compressionLevel: 9 }),
);

// Favicon SVG cũ (mũ tốt nghiệp) không còn dùng
await unlink(join(root, "public/icons/icon.svg")).catch(() => undefined);
