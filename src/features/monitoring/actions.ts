"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/features/auth/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/action-result";

const CONNECTION_ERROR = "Không thể kết nối máy chủ. Vui lòng thử lại.";

/**
 * Xoá file Storage mồ côi (ảnh / video của học sinh, khoảnh khắc, hội thoại đã bị xoá).
 * Danh sách lấy bằng RPC storage_orphans() (kiểm tra quyền admin trong DB), xoá qua Storage API — đúng cách duy nhất
 * để giải phóng dung lượng (xoá thẳng storage.objects bằng SQL để lại file trên ổ lưu trữ).
 */
export async function cleanupStorageOrphans(): Promise<ActionResult<{ removed: number; remaining: boolean }>> {
  await requireRole("admin");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, error: "Chưa cấu hình SUPABASE_SERVICE_ROLE_KEY trên server." };
  try {
    const supabase = await createClient();
    const BATCH = 1000;
    const { data, error } = await supabase.rpc("storage_orphans", { p_limit: BATCH });
    if (error) return { ok: false, error: error.code === "PGRST202" ? "Hãy chạy supabase/apply-monitoring.sql trước." : "Không lấy được danh sách file mồ côi." };
    const byBucket = new Map<string, string[]>();
    for (const o of data) byBucket.set(o.bucket_id, [...(byBucket.get(o.bucket_id) ?? []), o.name]);

    const admin = createAdminClient();
    let removed = 0;
    for (const [bucket, names] of byBucket) {
      for (let i = 0; i < names.length; i += 100) {
        const { data: done, error: rmError } = await admin.storage.from(bucket).remove(names.slice(i, i + 100));
        if (rmError) {
          console.error("[monitoring] Xoá file mồ côi lỗi:", rmError);
          return { ok: false, error: `Đã xoá ${removed} file, dừng do lỗi ở bucket ${bucket}.` };
        }
        removed += done?.length ?? 0;
      }
    }
    revalidatePath("/admin/system");
    return { ok: true, data: { removed, remaining: data.length === BATCH } };
  } catch (err) {
    console.error("[monitoring] cleanupStorageOrphans lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
}

/** Xoá nhật ký lỗi cũ hơn 90 ngày (bảng tự giữ gọn). */
export async function purgeOldErrors(): Promise<ActionResult<{ deleted: number }>> {
  await requireRole("admin");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, error: "Chưa cấu hình SUPABASE_SERVICE_ROLE_KEY trên server." };
  try {
    const { data, error } = await createAdminClient().rpc("purge_error_events", { p_keep_days: 90 });
    if (error) return { ok: false, error: "Không xoá được nhật ký cũ." };
    revalidatePath("/admin/system");
    return { ok: true, data: { deleted: data ?? 0 } };
  } catch (err) {
    console.error("[monitoring] purgeOldErrors lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
}
