import { PageTransition } from "@/components/shared/page-transition";

/** Mỗi lần chuyển trang / chuyển tab: hiệu ứng hiện dần nhẹ nhàng. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
