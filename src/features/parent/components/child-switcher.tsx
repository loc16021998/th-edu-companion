import Link from "next/link";
import { cn, givenName } from "@/lib/utils";
import type { Tables } from "@/types/database.types";
import { StudentAvatar } from "@/components/shared/student-avatar";

/** Chọn bé khi phụ huynh có nhiều con. Ẩn nếu chỉ có 1 bé. */
export function ChildSwitcher({
  students,
  selectedId,
  hrefFor,
}: {
  students: Tables<"students">[];
  selectedId: string;
  hrefFor: (childId: string) => string;
}) {
  if (students.length < 2) return null;

  return (
    <nav aria-label="Chọn con" className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      <ul className="flex gap-2">
        {students.map((s) => {
          const active = s.id === selectedId;
          return (
            <li key={s.id} className="shrink-0">
              <Link
                href={hrefFor(s.id)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full py-1 pl-1 pr-4 text-sm font-semibold ring-1 transition-colors",
                  active
                    ? "bg-primary text-primary-foreground ring-primary"
                    : "bg-card text-foreground ring-border active:bg-accent",
                )}
              >
                <StudentAvatar student={s} className="size-8 text-sm" />
                {givenName(s.full_name)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
