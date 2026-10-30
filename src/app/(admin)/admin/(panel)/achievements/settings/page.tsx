import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getBadgeCatalog, getMilestones } from "@/features/achievements/queries";
import { AchievementSettings } from "@/features/achievements/components/achievement-settings";

export const metadata: Metadata = { title: "Huy hiệu & mốc quà" };

export default async function AchievementSettingsPage() {
  const [catalog, milestones] = await Promise.all([getBadgeCatalog(), getMilestones(true)]);
  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/achievements" className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Tặng sao & huy hiệu
        </Link>
        <h1 className="text-xl font-extrabold">Huy hiệu & mốc quà</h1>
      </div>
      {catalog.available ? (
        <AchievementSettings badges={catalog.badges} milestones={milestones} />
      ) : (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Chưa cài đặt Góc Thành tích — chạy file <code>supabase/apply-achievements.sql</code> trong Supabase SQL Editor.
        </p>
      )}
    </div>
  );
}
