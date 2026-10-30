import { EmptyState } from "./section";

export function NoChildren() {
  return (
    <EmptyState
      emoji="🧒"
      title="Chưa có học sinh nào được liên kết"
      description="Vui lòng liên hệ nhà trường để liên kết tài khoản với hồ sơ của con."
    />
  );
}
