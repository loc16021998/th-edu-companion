import type { Metadata } from "next";
import { StudentAnalyticsScreen } from "@/features/progress/screens/student-analytics-screen";

export const metadata: Metadata = { title: "Phân tích học sinh" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  return <StudentAnalyticsScreen params={await searchParams} basePath="/admin/student-analytics" />;
}
