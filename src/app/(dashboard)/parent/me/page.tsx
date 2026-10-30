import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Phone } from "lucide-react";
import { CAMPUS_LABELS } from "@/config/constants";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { requireRole } from "@/features/auth/queries";
import { childHref, getSelectedChild } from "@/features/parent/children";
import { ParentMeMenu } from "@/features/parent/components/parent-me-menu";

export const metadata: Metadata = { title: "Cá nhân" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts.length > 1 ? parts.at(-2)![0]! + parts.at(-1)![0]! : (parts[0]?.[0] ?? "P")).toUpperCase();
}

export default async function ParentMePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const profile = await requireRole("parent");
  const { students, child } = await getSelectedChild(params.child);
  const childQuery = students.length > 1 && child ? new URLSearchParams({ child: child.id }).toString() : "";

  return (
    <div className="space-y-5">
      <section className="flex items-center gap-4 rounded-3xl bg-gradient-to-br from-edu-blue-500 via-edu-blue to-edu-blue-800 p-5 text-white shadow-lg shadow-edu-blue/25">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-white/20 text-2xl font-extrabold ring-2 ring-white/40" aria-hidden>
          {initials(profile.full_name || "Phụ huynh")}
        </span>
        <div className="min-w-0">
          <h1 className="break-words text-xl font-extrabold">{profile.full_name || "Phụ huynh"}</h1>
          <p className="text-sm text-white/85">Phụ huynh TH EDU</p>
          {profile.phone && (
            <p className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-white/90">
              <Phone className="size-3.5" /> {profile.phone.replace(/^\+?84/, "0")}
            </p>
          )}
        </div>
      </section>

      {students.length > 0 && (
        <section className="space-y-1.5">
          <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Con của tôi</h2>
          <ul className="space-y-2">
            {students.map((s) => (
              <li key={s.id}>
                <Link
                  href={childHref("/parent/dashboard", students.length > 1 ? s.id : undefined)}
                  className="tap flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border transition-colors active:bg-muted"
                >
                  <StudentAvatar student={s} className="size-12" />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-bold">{s.full_name}</span>
                    <span className="block text-xs text-muted-foreground">
                      Lớp {s.class_name} · {CAMPUS_LABELS[s.campus]}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ParentMeMenu childQuery={childQuery} />
    </div>
  );
}
