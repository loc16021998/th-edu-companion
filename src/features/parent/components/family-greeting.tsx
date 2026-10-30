"use client";

import { Check, Loader2 } from "lucide-react";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { CAMPUS_LABELS } from "@/config/constants";
import { cn, givenName } from "@/lib/utils";
import { useSelectedStudent } from "./selected-student";

/**
 * "Xin chào ba mẹ của bé …!" + (nhiều con) hàng avatar đổi bé 1 chạm, hiện rõ lớp · cơ sở của từng bé
 * để không nhầm khi xem nhật ký. `timeGreeting` tính ở server (giờ VN) → HTML server / client khớp nhau.
 */
export function FamilyGreeting({ timeGreeting }: { timeGreeting: string }) {
  const { students, activeStudent, setActiveStudent, isSwitching } = useSelectedStudent();
  if (!activeStudent) return null;
  const multiple = students.length > 1;

  return (
    <section aria-labelledby="family-greeting" className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-muted-foreground">{timeGreeting} 👋</p>
        <h1 id="family-greeting" className="text-xl font-extrabold leading-snug">
          Xin chào ba mẹ của bé {givenName(activeStudent.full_name)}!
        </h1>
        {multiple && <p className="text-sm text-muted-foreground">Gia đình có {students.length} bé đang học tại TH EDU — chạm vào bé để xem thông tin của bé đó.</p>}
      </div>

      {multiple && (
        // Lưới 2 cột, chữ tự xuống dòng — tên + lớp + cơ sở luôn đọc trọn (không cuộn ngang, không cắt chữ)
        <div role="radiogroup" aria-label="Chọn bé để xem" className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          {students.map((s) => {
            const active = s.id === activeStudent.id;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setActiveStudent(s.id)}
                className={cn(
                  "tap flex min-w-0 items-center gap-2.5 rounded-2xl p-2.5 text-left ring-1 transition-colors",
                  active ? "bg-primary text-primary-foreground shadow-md ring-primary" : "bg-card ring-border hover:bg-muted/60",
                )}
              >
                <span className="relative shrink-0">
                  <StudentAvatar student={s} className={cn("size-10 sm:size-11", active && "ring-2 ring-white")} />
                  {active && (
                    <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-white text-primary shadow">
                      {isSwitching ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" strokeWidth={3} />}
                    </span>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block break-words text-sm font-bold leading-tight">{s.full_name}</span>
                  <span className={cn("block text-xs", active ? "text-white/85" : "text-muted-foreground")}>
                    Lớp {s.class_name} · {CAMPUS_LABELS[s.campus]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
