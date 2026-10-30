import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Đường dẫn cũ (tab "Lịch sử") → tab "Chuyên cần", giữ nguyên tham số (vd. link trong thông báo cũ). */
export default async function LegacyHistoryPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (typeof value === "string") qs.set(key, value);
  redirect(qs.size ? `/parent/attendance?${qs}` : "/parent/attendance");
}
