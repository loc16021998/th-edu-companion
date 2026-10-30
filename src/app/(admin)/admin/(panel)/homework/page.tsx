import type { Metadata } from "next";
import { HomeworkMonitorScreen } from "@/features/homework/screens/homework-monitor-screen";

export const metadata: Metadata = { title: "Bài tập về nhà" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  return <HomeworkMonitorScreen params={await searchParams} basePath="/admin/homework" />;
}
