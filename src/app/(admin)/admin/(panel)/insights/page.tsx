import type { Metadata } from "next";
import { connection } from "next/server";
import { requireRole } from "@/features/auth/queries";
import { InsightsScreen } from "@/features/insights/screens/insights-screen";

export const metadata: Metadata = { title: "Cảnh báo sớm" };

export default async function AdminInsightsPage() {
  await connection();
  await requireRole("admin");
  return <InsightsScreen mode="admin" />;
}
