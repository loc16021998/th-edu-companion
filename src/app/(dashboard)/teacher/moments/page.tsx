import type { Metadata } from "next";
import { StaffMomentsScreen } from "@/features/moments/screens/staff-moments-screen";

export const metadata: Metadata = { title: "Góc khoảnh khắc" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  return <StaffMomentsScreen params={await searchParams} basePath="/teacher/moments" />;
}
