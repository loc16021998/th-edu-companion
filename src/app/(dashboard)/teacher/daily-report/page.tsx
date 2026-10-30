import type { Metadata } from "next";
import { DailyReportScreen } from "@/features/teacher/screens/daily-report-screen";

export const metadata: Metadata = { title: "Sổ liên lạc" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  return <DailyReportScreen params={await searchParams} basePath="/teacher/daily-report" />;
}
