"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, GraduationCap, UsersRound, type LucideIcon } from "lucide-react";
import { PARENT_LOGIN_PATH, TEACHER_LOGIN_PATH } from "@/lib/auth/routes";
import { cn } from "@/lib/utils";

const LAST_KEY = "th-edu:login-portal";

type Choice = "parent" | "teacher";

const CHOICES: Record<Choice, { href: string; title: string; description: string; icon: LucideIcon; tone: string }> = {
  parent: {
    href: PARENT_LOGIN_PATH,
    title: "Tôi là phụ huynh",
    description: "Theo dõi học tập, lịch học, chuyên cần, học phí của con",
    icon: UsersRound,
    tone: "from-primary to-[#1b6f48]",
  },
  teacher: {
    href: TEACHER_LOGIN_PATH,
    title: "Tôi là giáo viên",
    description: "Điểm danh, viết sổ liên lạc cho lớp phụ trách",
    icon: GraduationCap,
    tone: "from-sky-500 to-indigo-600",
  },
};

/** Hai lựa chọn đăng nhập; nhớ lựa chọn lần trước trên thiết bị để đưa lên đầu. */
export function LoginChooser({ query }: { query: string }) {
  const [last, setLast] = useState<Choice | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_KEY);
      if (saved === "parent" || saved === "teacher") setLast(saved);
    } catch {
      // localStorage bị chặn
    }
  }, []);

  const order: Choice[] = last === "teacher" ? ["teacher", "parent"] : ["parent", "teacher"];

  return (
    <ul className="space-y-3">
      {order.map((key) => {
        const { href, title, description, icon: Icon, tone } = CHOICES[key];
        return (
          <li key={key}>
            <Link
              href={query ? `${href}?${query}` : href}
              onClick={() => {
                try {
                  localStorage.setItem(LAST_KEY, key);
                } catch {
                  // bỏ qua
                }
              }}
              className={cn(
                "group flex items-center gap-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border transition-all hover:shadow-md active:scale-[0.99]",
                last === key && "ring-2 ring-primary/40",
              )}
            >
              <span className={cn("flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white", tone)}>
                <Icon className="size-7" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-lg font-bold">
                  {title}
                  {last === key && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">Lần trước</span>}
                </span>
                <span className="block text-sm text-muted-foreground">{description}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
