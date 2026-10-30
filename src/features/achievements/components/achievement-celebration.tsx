"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { haptic } from "@/components/ui/toast";
import type { Badge } from "../constants";
import { fireConfetti } from "../confetti";
import type { Milestone } from "../milestones";
import { BadgeMedal } from "./badge-medal";

type Recent = { id: string; badgeId: string; createdAt: string };

/** Lần đầu mở trên máy này: chỉ chúc mừng huy hiệu trong 3 ngày gần nhất (không "bắn" lại cả lịch sử). */
const FIRST_VISIT_WINDOW_MS = 3 * 24 * 3600 * 1000;
const badgeKey = (studentId: string) => `th-edu:celebrated-badge:${studentId}`;
const milestoneKey = (studentId: string) => `th-edu:celebrated-milestone:${studentId}`;

function read(key: string): string | null | undefined {
  try {
    return localStorage.getItem(key);
  } catch {
    return undefined; // bộ nhớ bị chặn → không biết đã chúc mừng chưa → không bắn (tránh bắn mỗi lần mở)
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

/**
 * Pháo giấy + lời chúc mừng khi bé có HUY HIỆU MỚI hoặc vừa đạt MỐC QUÀ mới kể từ lần mở app trước trên máy này.
 * Đóng lại → ghi nhớ (localStorage) để không chúc mừng lặp lại.
 */
export function AchievementCelebration({
  studentId,
  childName,
  badges,
  recent,
  total,
  milestones,
  moreHref,
}: {
  studentId: string;
  childName: string;
  badges: Badge[];
  recent: Recent[];
  total: number;
  milestones: Milestone[];
  /** Có → nút "Xem bộ sưu tập" (ở trang Hôm nay) */
  moreHref?: string;
}) {
  const [show, setShow] = useState<{ badges: Badge[]; milestone: Milestone | null; latest: string | null; reachedStars: number } | null>(null);

  useEffect(() => {
    const seenBadge = read(badgeKey(studentId));
    const seenMilestone = read(milestoneKey(studentId));
    if (seenBadge === undefined || seenMilestone === undefined) return;

    const cutoff = seenBadge ?? new Date(Date.now() - FIRST_VISIT_WINDOW_MS).toISOString();
    const byId = new Map(badges.map((b) => [b.id, b]));
    const fresh = recent.filter((r) => r.createdAt > cutoff && byId.has(r.badgeId));
    const latest = recent.reduce<string | null>((m, r) => (!m || r.createdAt > m ? r.createdAt : m), seenBadge);

    const reached = milestones.filter((m) => m.starsRequired <= total).at(-1) ?? null;
    // Lần đầu: coi các mốc đã đạt trước đó là "đã biết" (chỉ chúc mừng mốc đạt từ nay)
    if (seenMilestone === null) write(milestoneKey(studentId), String(reached?.starsRequired ?? 0));
    const newMilestone = seenMilestone !== null && reached && reached.starsRequired > Number(seenMilestone) ? reached : null;

    if (fresh.length === 0 && !newMilestone) {
      if (latest && latest !== seenBadge) write(badgeKey(studentId), latest);
      return;
    }
    // Mỗi huy hiệu hiện 1 lần (bé nhận 2 lần "Cây bút vàng" → hiện 1 huy chương ×2)
    const unique = [...new Map(fresh.map((r) => [r.badgeId, byId.get(r.badgeId)!])).values()];
    setShow({ badges: unique, milestone: newMilestone, latest, reachedStars: reached?.starsRequired ?? 0 });
    // Chỉ xét khi mở trang / đổi bé — trang tự làm mới (realtime) không bắn lại pháo giấy
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const open = show !== null;
  useEffect(() => {
    if (!open) return;
    let stop = () => {};
    const t = window.setTimeout(() => {
      stop = fireConfetti();
      haptic("success");
    }, 350);
    return () => {
      window.clearTimeout(t);
      stop();
    };
  }, [open]);

  function close() {
    if (show?.latest) write(badgeKey(studentId), show.latest);
    if (show?.milestone) write(milestoneKey(studentId), String(show.reachedStars));
    setShow(null);
  }

  if (!show) return null;
  const count = show.badges.length;
  const title = count
    ? count === 1
      ? `Bé ${childName} vừa nhận huy hiệu “${show.badges[0]!.name}”!`
      : `Bé ${childName} vừa nhận ${count} huy hiệu mới!`
    : `Bé ${childName} đã đủ sao nhận quà!`;

  return (
    <Sheet open onOpenChange={(open) => !open && close()}>
      <SheetContent className="text-center">
        <SheetHeader className="pr-0 text-center">
          <p className="text-4xl" aria-hidden>
            🎉
          </p>
          <SheetTitle className="text-xl">{title}</SheetTitle>
          <SheetDescription>Cùng con xem và khen bé thật nhiều nhé — cô ghi nhận sự cố gắng của bé ở lớp.</SheetDescription>
        </SheetHeader>

        {count > 0 && (
          <ul className="flex flex-wrap justify-center gap-4 py-2">
            {show.badges.map((b) => (
              <li key={b.id} className="flex w-28 flex-col items-center gap-1.5 animate-in zoom-in-50 fade-in-0 duration-500">
                <BadgeMedal badge={b} size={count === 1 ? "lg" : "md"} />
                <span className="text-sm font-bold leading-tight">{b.name}</span>
                {b.description && <span className="text-xs text-muted-foreground">{b.description}</span>}
              </li>
            ))}
          </ul>
        )}

        {show.milestone && (
          <div className="mx-auto mt-2 max-w-sm rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
            <p className="text-3xl" aria-hidden>
              {show.milestone.emoji}
            </p>
            <p className="font-bold text-amber-900">
              Đạt mốc {show.milestone.starsRequired} sao: {show.milestone.title}
            </p>
            <p className="text-xs text-amber-900/80">Cô sẽ trao quà cho bé ở lớp.</p>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {moreHref && (
            <Button asChild variant="outline" onClick={close}>
              <Link href={moreHref}>Xem bộ sưu tập</Link>
            </Button>
          )}
          <Button onClick={close}>Tuyệt vời! 👏</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
