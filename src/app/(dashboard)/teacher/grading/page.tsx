import type { Metadata } from "next";
import { GradingScreen } from "@/features/homework/screens/grading-screen";

export const metadata: Metadata = { title: "Chấm bài & thưởng sao" };

/** AI phân tích ảnh bài tập (server action / sau khi nộp) có thể mất vài chục giây */
export const maxDuration = 120;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  return <GradingScreen params={await searchParams} basePath="/teacher/grading" />;
}
