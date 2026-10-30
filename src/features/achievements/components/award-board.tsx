"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Check, Gift, Loader2, Plus, Sparkles, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { haptic, toast } from "@/components/ui/toast";
import { confirmSheet } from "@/components/ui/confirm-sheet";
import { cn, givenName } from "@/lib/utils";
import { awardClassStars, setRewardGiven, setSessionStars, toggleBadge } from "../actions";
import type { Badge } from "../constants";
import { nextStarValue, type Milestone } from "../milestones";
import { BadgeChip, BadgeMedal } from "./badge-medal";

export type AwardRow = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  absent: boolean;
  stars: number;
  badgeIds: string[];
  total: number;
};

type Change = { type: "stars"; id: string; stars: number } | { type: "badge"; id: string; badgeId: string; on: boolean } | { type: "bulk"; ids: string[]; stars: number };

function apply(rows: AwardRow[], c: Change): AwardRow[] {
  return rows.map((r) => {
    if (c.type === "stars" && r.id === c.id) return { ...r, total: r.total - r.stars + c.stars, stars: c.stars };
    if (c.type === "bulk" && c.ids.includes(r.id) && r.stars === 0) return { ...r, total: r.total + c.stars, stars: c.stars };
    if (c.type === "badge" && r.id === c.id) return { ...r, badgeIds: c.on ? [...r.badgeIds, c.badgeId] : r.badgeIds.filter((b) => b !== c.badgeId) };
    return r;
  });
}

/**
 * Bảng tặng sao & huy hiệu sau buổi học: chạm sao để chấm 1–3 (chạm lại để bỏ), "+ Huy hiệu" để vinh danh.
 * Lưu ngay từng chạm (hiện trước, máy chủ xác nhận sau); phụ huynh nhận 1 thông báo gộp / bé / ngày.
 */
export function AwardBoard({ rows, badges, date, editable, lockedReason }: { rows: AwardRow[]; badges: Badge[]; date: string; editable: boolean; lockedReason?: string }) {
  const [view, change] = useOptimistic(rows, apply);
  const [, startTransition] = useTransition();
  const [bulkPending, startBulk] = useTransition();
  const [picking, setPicking] = useState<string | null>(null);
  const byId = new Map(badges.map((b) => [b.id, b]));
  const active = badges.filter((b) => b.active);
  const pickRow = view.find((r) => r.id === picking) ?? null;

  function run(c: Change, action: () => Promise<{ ok: boolean; error?: string }>) {
    haptic("tap");
    startTransition(async () => {
      change(c);
      const res = await action();
      if (!res.ok) toast.error("Chưa lưu được", res.error);
    });
  }

  const tapStar = (r: AwardRow, n: number) => {
    const stars = nextStarValue(r.stars, n);
    run({ type: "stars", id: r.id, stars }, () => setSessionStars({ studentId: r.id, date, stars }));
  };

  const flipBadge = (r: AwardRow, badgeId: string) => {
    const on = !r.badgeIds.includes(badgeId);
    run({ type: "badge", id: r.id, badgeId, on }, () => toggleBadge({ studentId: r.id, badgeId, date, on }));
  };

  const waiting = view.filter((r) => !r.absent && r.stars === 0);
  async function bulk() {
    const ok = await confirmSheet({
      title: `Tặng 1 ⭐ cho ${waiting.length} bé có mặt chưa có sao?`,
      description: "Các bé cô đã chấm riêng giữ nguyên số sao. Sau đó cô có thể chạm để tăng sao cho từng bé.",
      confirmLabel: "Tặng sao",
    });
    if (!ok) return;
    const ids = waiting.map((r) => r.id);
    startBulk(async () => {
      change({ type: "bulk", ids, stars: 1 });
      const res = await awardClassStars({ studentIds: ids, date, stars: 1 });
      if (!res.ok) toast.error("Chưa tặng được sao", res.error);
      else toast.success(`Đã tặng sao cho ${res.data.count} bé`, "Phụ huynh nhận thông báo ngay.");
    });
  }

  return (
    <div className="space-y-3">
      {!editable && lockedReason && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 ring-1 ring-amber-200">{lockedReason}</p>}
      {editable && waiting.length > 0 && (
        <Button variant="outline" className="w-full sm:w-auto" onClick={bulk} disabled={bulkPending}>
          {bulkPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4 text-amber-500" />}
          Tặng 1 ⭐ cho {waiting.length} bé có mặt chưa có sao
        </Button>
      )}

      <ul className="grid gap-2 lg:grid-cols-2">
        {view.map((r) => (
          <li key={r.id} className={cn("space-y-2 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border", r.absent && "opacity-70")}>
            <div className="flex items-center gap-3">
              <StudentAvatar student={r} className="size-10" />
              <div className="min-w-0 flex-1">
                <p className="break-words font-bold leading-tight">{r.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.absent ? "Vắng buổi này · " : ""}Tổng {r.total} ⭐
                </p>
              </div>
              <div className="flex shrink-0" role="group" aria-label={`Sao buổi học của ${givenName(r.full_name)}`}>
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={!editable}
                    onClick={() => tapStar(r, n)}
                    aria-pressed={r.stars >= n}
                    aria-label={r.stars === n ? `Bỏ ${n} sao` : `Tặng ${n} sao`}
                    className="tap flex size-10 items-center justify-center rounded-full transition-transform active:scale-90 disabled:cursor-not-allowed"
                  >
                    <Star className={cn("size-7 transition-colors", n <= r.stars ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {r.badgeIds.map((id) => {
                const b = byId.get(id);
                if (!b) return null;
                return (
                  <BadgeChip key={id} badge={b}>
                    {editable && (
                      <button type="button" onClick={() => flipBadge(r, id)} className="-mr-1 ml-0.5 rounded-full p-0.5 hover:bg-black/10" aria-label={`Gỡ huy hiệu ${b.name}`}>
                        <X className="size-3" />
                      </button>
                    )}
                  </BadgeChip>
                );
              })}
              {editable && active.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPicking(r.id)}
                  className="tap inline-flex items-center gap-1 rounded-full border border-dashed border-amber-400 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50"
                >
                  <Plus className="size-3.5" /> Huy hiệu
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Sheet open={!!pickRow} onOpenChange={(open) => !open && setPicking(null)}>
        <SheetContent>
          {pickRow && (
            <>
              <SheetHeader>
                <SheetTitle>Vinh danh bé {givenName(pickRow.full_name)}</SheetTitle>
                <SheetDescription>Chạm để trao / gỡ huy hiệu cho buổi học này. Phụ huynh nhận thông báo kèm pháo giấy chúc mừng 🎉</SheetDescription>
              </SheetHeader>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {active.map((b) => {
                  const on = pickRow.badgeIds.includes(b.id);
                  return (
                    <li key={b.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => flipBadge(pickRow, b.id)}
                        className={cn(
                          "tap relative flex w-full flex-col items-center gap-1.5 rounded-2xl p-3 text-center ring-1 transition-colors",
                          on ? "bg-amber-50 ring-2 ring-amber-400" : "bg-card ring-border hover:bg-muted/60",
                        )}
                      >
                        {on && (
                          <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-amber-500 text-white">
                            <Check className="size-3" strokeWidth={3} />
                          </span>
                        )}
                        <BadgeMedal badge={b} />
                        <span className="text-sm font-bold leading-tight">{b.name}</span>
                        {b.description && <span className="text-xs leading-tight text-muted-foreground">{b.description}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <Button className="mt-4 w-full" onClick={() => setPicking(null)}>
                Xong
              </Button>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export type DueReward = { studentId: string; name: string; avatar_url: string | null; total: number; milestone: Milestone };

/** Bé đã đủ sao nhận quà nhưng cô chưa trao → bấm "Đã trao quà" sau khi trao ở lớp. */
export function RewardsDue({ items }: { items: DueReward[] }) {
  const [view, hide] = useOptimistic(items, (list: DueReward[], key: string) => list.filter((i) => `${i.studentId}:${i.milestone.id}` !== key));
  const [, startTransition] = useTransition();
  if (view.length === 0) return null;

  const give = (i: DueReward) =>
    startTransition(async () => {
      hide(`${i.studentId}:${i.milestone.id}`);
      const res = await setRewardGiven({ studentId: i.studentId, milestoneId: i.milestone.id, given: true });
      if (!res.ok) toast.error("Chưa lưu được", res.error);
      else toast.success(`Đã trao ${i.milestone.title} cho bé ${givenName(i.name)}`, "Phụ huynh thấy “Đã nhận” trong Góc Thành tích.");
    });

  return (
    <section className="space-y-2 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 p-3 ring-1 ring-amber-200">
      <h2 className="flex items-center gap-2 font-bold text-amber-950">
        <Gift className="size-5 text-amber-600" /> Quà cần trao ({view.length})
      </h2>
      <ul className="space-y-1.5">
        {view.map((i) => (
          <li key={`${i.studentId}:${i.milestone.id}`} className="flex items-center gap-3 rounded-xl bg-white/80 px-3 py-2">
            <span className="text-2xl" aria-hidden>
              {i.milestone.emoji}
            </span>
            <span className="min-w-0 flex-1 text-sm">
              <span className="block break-words font-bold">{i.name}</span>
              <span className="block text-xs text-muted-foreground">
                {i.milestone.title} · mốc {i.milestone.starsRequired} ⭐ (bé có {i.total})
              </span>
            </span>
            <Button size="sm" onClick={() => give(i)}>
              Đã trao quà
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
