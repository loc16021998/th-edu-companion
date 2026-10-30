/**
 * Hiệu ứng chuyển trang (dùng trong template.tsx — template được tạo mới mỗi lần đổi trang):
 * hiện rõ dần (từ 40%) + trượt nhẹ 6px trong ~160ms — đủ mượt mà không làm chậm cảm giác mở trang. Chỉ dùng opacity/transform → không xô lệch bố cục;
 * kết thúc ở transform: none nên không ảnh hưởng phần tử position: fixed bên trong trang.
 * Máy bật "Giảm chuyển động" → tắt (globals.css).
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
