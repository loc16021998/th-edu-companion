import type { Metadata } from "next";
import { AttendanceScreen } from "@/features/teacher/screens/attendance-screen";

export const metadata: Metadata = { title: "Điểm danh học sinh" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  // Quản trị: mặc định chỉ xem, bấm "Sửa điểm danh" mới chỉnh được
  return <AttendanceScreen params={await searchParams} mode="review" />;
}
