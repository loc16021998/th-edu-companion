import type { Metadata } from "next";
import { AwardScreen } from "@/features/achievements/screens/award-screen";

export const metadata: Metadata = { title: "Tặng sao & huy hiệu" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  return <AwardScreen params={await searchParams} />;
}
