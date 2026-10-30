"use client";

/**
 * Nén ảnh trên trình duyệt trước khi tải lên Supabase Storage (thư viện browser-image-compression, chạy trong Web Worker
 * → không đơ giao diện). Mục tiêu < 400KB nhưng vẫn đọc rõ chữ viết tay của bé.
 *
 * Với ảnh chụp trang vở, chất lượng JPEG thấp làm nét chữ nhoè và sinh viền "muỗi" quanh nét bút — tệ hơn nhiều
 * so với giảm độ phân giải vừa phải. Nên ưu tiên GIỮ chất lượng (≥ 0.72) và hạ dần cạnh dài theo thang
 * 2048 → 1792 → 1600 → 1440 → 1280px (1280px vẫn đủ đọc chữ trên 1 trang vở ô li). Chỉ khi vẫn quá nặng
 * (ảnh cực nhiều chi tiết) mới để thư viện hạ thêm chất lượng.
 * Bỏ EXIF (vị trí GPS, thông tin máy) → bảo vệ riêng tư của trẻ.
 * Ảnh đã nhỏ, GIF động, HEIC trên trình duyệt không giải mã được → giữ nguyên file gốc.
 */

export const TARGET_IMAGE_BYTES = 400 * 1024;
const DIMENSION_LADDER = [2048, 1792, 1600, 1440, 1280];
const QUALITY = 0.82;
const MIN_QUALITY = 0.72;
const COMPRESSIBLE = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export async function compressImage(file: File, opts: { maxBytes?: number; maxDimension?: number } = {}): Promise<Blob> {
  const maxBytes = opts.maxBytes ?? TARGET_IMAGE_BYTES;
  if (!COMPRESSIBLE.has(file.type) || file.size <= maxBytes) return file;
  try {
    // Tải thư viện khi cần (không làm nặng lần tải trang đầu)
    const { default: imageCompression } = await import("browser-image-compression");
    const base = { fileType: "image/jpeg", useWebWorker: true, preserveExif: false } as const;
    const ladder = DIMENSION_LADDER.filter((d) => d <= (opts.maxDimension ?? DIMENSION_LADDER[0]!));
    if (ladder.length === 0) ladder.push(opts.maxDimension!);

    let best: Blob = file;
    for (const dimension of ladder) {
      // Giữ nguyên độ phân giải của nấc này; chỉ cho hạ chất lượng nhẹ (0.82 → ~0.72)
      const out = await imageCompression(file, {
        ...base,
        maxSizeMB: maxBytes / (1024 * 1024),
        maxWidthOrHeight: dimension,
        initialQuality: QUALITY,
        alwaysKeepResolution: true,
        maxIteration: Math.ceil(Math.log(MIN_QUALITY / QUALITY) / Math.log(0.95)),
      });
      if (out.size < best.size) best = out;
      if (out.size <= maxBytes) return out;
    }

    // Ảnh rất nhiều chi tiết: nấc nhỏ nhất vẫn quá nặng → để thư viện hạ thêm cả chất lượng lẫn kích thước
    const last = await imageCompression(file, {
      ...base,
      maxSizeMB: maxBytes / (1024 * 1024),
      maxWidthOrHeight: ladder.at(-1)!,
      initialQuality: MIN_QUALITY,
      maxIteration: 10,
    });
    return last.size < best.size ? last : best;
  } catch (err) {
    console.warn("[images] Không nén được ảnh, dùng ảnh gốc:", err);
    return file;
  }
}
