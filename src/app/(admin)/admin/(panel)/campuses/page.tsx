import type { Metadata } from "next";
import { listClasses } from "@/features/admin/queries";
import { getCampusProfiles, listAllTransferRequests } from "@/features/campuses/queries";
import { CampusProfileEditor, TransferRequestsAdmin } from "@/features/campuses/components/campus-admin";
import { AdminFeedMarkRead } from "@/features/admin-feed/components/admin-feed-mark-read";

export const metadata: Metadata = { title: "Cơ sở & bản đồ" };

export default async function AdminCampusesPage() {
  const [{ available, campuses }, requests, classes] = await Promise.all([getCampusProfiles(), listAllTransferRequests(), listClasses()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold">Cơ sở & bản đồ</h1>
        <p className="text-sm text-muted-foreground">Thông tin phụ huynh thấy ở mục “Cơ sở & đưa đón”: địa chỉ, toạ độ chỉ đường, hotline, ảnh mặt tiền, giờ mở cửa.</p>
      </div>
      {!available ? (
        <div className="space-y-2 rounded-2xl bg-card p-5 text-sm shadow-sm ring-1 ring-amber-200">
          <p className="font-bold">Database chưa có bảng cơ sở</p>
          <p className="text-muted-foreground">
            Chạy file <span className="font-mono text-xs font-semibold text-foreground">supabase/apply-campuses.sql</span> trong Supabase SQL Editor rồi tải lại trang. Hiện phụ huynh đang thấy thông tin mặc định.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {campuses.map((c) => (
            <CampusProfileEditor key={`${c.campus}:${c.lat}:${c.lng}:${c.photoUrl}`} campus={c} />
          ))}
        </div>
      )}
      <section className="space-y-3">
        <AdminFeedMarkRead category="feedback" />
        <h2 className="text-base font-bold">Đơn xin chuyển cơ sở</h2>
        {requests.available ? (
          <TransferRequestsAdmin requests={requests.items} classes={classes.map((c) => ({ id: c.id, campus: c.campus, name: c.name }))} campuses={campuses} />
        ) : (
          <p className="text-sm text-muted-foreground">Có sau khi chạy apply-campuses.sql.</p>
        )}
      </section>
    </div>
  );
}
