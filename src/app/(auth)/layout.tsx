import { ClearUserCache } from "@/components/shared/clear-user-cache";
import { FloatingContact } from "@/features/parent-chat/components/floating-contact";

/** Trang đăng nhập phụ huynh / giáo viên: nút "Chat với tư vấn viên" (tự động) + "Chat Zalo". */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/* Đăng xuất / đổi tài khoản → xoá trang, ảnh đã lưu offline của người trước */}
      <ClearUserCache />
      <FloatingContact mode="public" storageKey="th-edu:consult-chat" />
    </>
  );
}
