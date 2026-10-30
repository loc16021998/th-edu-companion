"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { saveBadge, saveMilestone } from "../actions";
import { BADGE_TONES, type Badge, type BadgeTone } from "../constants";
import type { Milestone } from "../milestones";
import { BadgeMedal } from "./badge-medal";

const TONE_LABEL: Record<BadgeTone, string> = { amber: "Vàng", rose: "Hồng", sky: "Xanh dương", emerald: "Xanh lá", violet: "Tím", orange: "Cam" };

type BadgeDraft = { id?: string; name: string; emoji: string; description: string; tone: BadgeTone; active: boolean };
type MilestoneDraft = { id?: string; starsRequired: string; title: string; emoji: string; description: string; active: boolean };

function ActiveToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      <input type="checkbox" className="size-4 accent-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      Đang dùng (bỏ chọn = ẩn, bé đã nhận vẫn giữ trong bộ sưu tập)
    </label>
  );
}

/** Quản trị: danh mục huy hiệu + mốc quà khích lệ. Không xoá (giữ lịch sử của bé) — chỉ ẩn. */
export function AchievementSettings({ badges, milestones }: { badges: Badge[]; milestones: (Milestone & { active: boolean })[] }) {
  const [badge, setBadge] = useState<BadgeDraft | null>(null);
  const [milestone, setMilestone] = useState<MilestoneDraft | null>(null);
  const [pending, startTransition] = useTransition();

  const submitBadge = () =>
    badge &&
    startTransition(async () => {
      const res = await saveBadge({ ...badge, description: badge.description });
      if (!res.ok) return toast.error("Chưa lưu được huy hiệu", res.error);
      toast.success(badge.id ? "Đã cập nhật huy hiệu" : "Đã thêm huy hiệu", "Giáo viên dùng được ngay.");
      setBadge(null);
    });

  const submitMilestone = () =>
    milestone &&
    startTransition(async () => {
      const res = await saveMilestone({ ...milestone, starsRequired: Number(milestone.starsRequired) });
      if (!res.ok) return toast.error("Chưa lưu được mốc quà", res.error);
      toast.success(milestone.id ? "Đã cập nhật mốc quà" : "Đã thêm mốc quà");
      setMilestone(null);
    });

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Huy hiệu vinh danh</h2>
          <Button size="sm" onClick={() => setBadge({ name: "", emoji: "🏅", description: "", tone: "amber", active: true })}>
            <Plus className="size-4" /> Thêm huy hiệu
          </Button>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {badges.map((b) => (
            <li key={b.id} className={cn("flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border", !b.active && "opacity-60")}>
              <BadgeMedal badge={b} earned={b.active} />
              <div className="min-w-0 flex-1">
                <p className="break-words font-bold">{b.name}</p>
                <p className="break-words text-xs text-muted-foreground">{b.active ? b.description || "—" : "Đã ẩn"}</p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Sửa ${b.name}`}
                onClick={() => setBadge({ id: b.id, name: b.name, emoji: b.emoji, description: b.description ?? "", tone: b.tone, active: b.active })}
              >
                <Pencil className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">Mốc quà khích lệ</h2>
            <p className="text-sm text-muted-foreground">Tính theo tổng sao tích luỹ (sao buổi học + sao bài tập về nhà).</p>
          </div>
          <Button size="sm" onClick={() => setMilestone({ starsRequired: "", title: "", emoji: "🎁", description: "", active: true })}>
            <Plus className="size-4" /> Thêm mốc
          </Button>
        </div>
        <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
          {milestones.map((m) => (
            <li key={m.id} className={cn("flex items-center gap-3 px-3 py-2.5", !m.active && "opacity-60")}>
              <span className="text-2xl" aria-hidden>
                {m.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words font-bold">{m.title}</p>
                <p className="text-xs text-muted-foreground">
                  {m.starsRequired} sao{m.active ? "" : " · Đã ẩn"}
                  {m.description ? ` · ${m.description}` : ""}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Sửa ${m.title}`}
                onClick={() =>
                  setMilestone({ id: m.id, starsRequired: String(m.starsRequired), title: m.title, emoji: m.emoji, description: m.description ?? "", active: m.active })
                }
              >
                <Pencil className="size-4" />
              </Button>
            </li>
          ))}
          {milestones.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">Chưa có mốc quà.</li>}
        </ul>
      </section>

      <Sheet open={!!badge} onOpenChange={(o) => !o && !pending && setBadge(null)}>
        <SheetContent locked={pending}>
          {badge && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitBadge();
              }}
              className="space-y-3"
            >
              <SheetHeader>
                <SheetTitle>{badge.id ? "Sửa huy hiệu" : "Thêm huy hiệu"}</SheetTitle>
                <SheetDescription>Tên ngắn gọn, dễ thương — phụ huynh và bé sẽ thấy trong bộ sưu tập.</SheetDescription>
              </SheetHeader>
              <div className="flex items-center gap-3">
                <BadgeMedal badge={{ ...badge, name: badge.name }} />
                <div className="grid flex-1 grid-cols-[5rem_1fr] gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="b-emoji">Biểu tượng</Label>
                    <Input id="b-emoji" value={badge.emoji} maxLength={16} onChange={(e) => setBadge({ ...badge, emoji: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="b-name">Tên huy hiệu</Label>
                    <Input id="b-name" value={badge.name} maxLength={40} required onChange={(e) => setBadge({ ...badge, name: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="b-desc">Mô tả (vì sao bé nhận)</Label>
                <Input id="b-desc" value={badge.description} maxLength={160} onChange={(e) => setBadge({ ...badge, description: e.target.value })} />
              </div>
              <fieldset className="space-y-1">
                <legend className="text-sm font-medium">Màu huy chương</legend>
                <div className="flex flex-wrap gap-2">
                  {BADGE_TONES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={badge.tone === t}
                      onClick={() => setBadge({ ...badge, tone: t })}
                      className={cn("rounded-full px-3 py-1 text-xs font-semibold ring-1", badge.tone === t ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border")}
                    >
                      {TONE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </fieldset>
              <ActiveToggle checked={badge.active} onChange={(active) => setBadge({ ...badge, active })} />
              <Button type="submit" className="w-full" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />} Lưu huy hiệu
              </Button>
            </form>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!milestone} onOpenChange={(o) => !o && !pending && setMilestone(null)}>
        <SheetContent locked={pending}>
          {milestone && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitMilestone();
              }}
              className="space-y-3"
            >
              <SheetHeader>
                <SheetTitle>{milestone.id ? "Sửa mốc quà" : "Thêm mốc quà"}</SheetTitle>
                <SheetDescription>Bé đủ số sao → giáo viên thấy trong mục “Quà cần trao”.</SheetDescription>
              </SheetHeader>
              <div className="grid grid-cols-[5rem_1fr] gap-2">
                <div className="space-y-1">
                  <Label htmlFor="m-emoji">Biểu tượng</Label>
                  <Input id="m-emoji" value={milestone.emoji} maxLength={16} onChange={(e) => setMilestone({ ...milestone, emoji: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="m-stars">Số sao cần đạt</Label>
                  <Input
                    id="m-stars"
                    inputMode="numeric"
                    value={milestone.starsRequired}
                    required
                    onChange={(e) => setMilestone({ ...milestone, starsRequired: e.target.value.replace(/\D/g, "").slice(0, 5) })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="m-title">Phần quà</Label>
                <Input id="m-title" value={milestone.title} maxLength={60} required onChange={(e) => setMilestone({ ...milestone, title: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="m-desc">Ghi chú</Label>
                <Input id="m-desc" value={milestone.description} maxLength={160} onChange={(e) => setMilestone({ ...milestone, description: e.target.value })} />
              </div>
              <ActiveToggle checked={milestone.active} onChange={(active) => setMilestone({ ...milestone, active })} />
              <Button type="submit" className="w-full" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />} Lưu mốc quà
              </Button>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
