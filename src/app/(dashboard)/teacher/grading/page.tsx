import type { Metadata } from "next";
import { GradingScreen } from "@/features/homework/screens/grading-screen";

export const metadata: Metadata = { title: "Chấm bài & thưởng sao" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  return <GradingScreen params={await searchParams} basePath="/teacher/grading" />;
}
