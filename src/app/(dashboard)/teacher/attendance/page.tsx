import type { Metadata } from "next";
import { AttendanceScreen } from "@/features/teacher/screens/attendance-screen";

export const metadata: Metadata = { title: "Điểm danh" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  return <AttendanceScreen params={await searchParams} />;
}
