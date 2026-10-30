"use client";

import { useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { CAMPUS_LABELS } from "@/config/constants";
import { cn, givenName } from "@/lib/utils";
import { useSelectedStudent, type FamilyChild } from "./selected-student";

export type ChipChild = FamilyChild;

/**
 * Góc trên header (phụ huynh): avatar + tên bé + lớp · cơ sở của bé đang xem (SelectedStudentContext).
 * Có nhiều con → chạm để mở Bottom Sheet chọn bé; đổi bé giữ nguyên trang đang xem, lựa chọn được ghi nhớ cho lần mở app sau.
 */
export function ChildChip() {
  const { students: kids, activeStudent, setActiveStudent, isSwitching } = useSelectedStudent();
  const [open, setOpen] = useState(false);
  if (!activeStudent) return null;

  const selected = activeStudent;
  const multiple = kids.length > 1;

  function choose(id: string) {
    setOpen(false);
    setActiveStudent(id);
  }

  const body = (
    <>
      <StudentAvatar student={selected} className="size-9 text-sm ring-2 ring-background" />
      <span className="min-w-0 text-left leading-tight">
        <span className="block break-words text-sm font-bold">Bé {givenName(selected.full_name)}</span>
        <span className="block break-words text-xs text-muted-foreground">
          {selected.class_name} · {CAMPUS_LABELS[selected.campus]}
        </span>
      </span>
      {multiple &&
        (isSwitching ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-label="Đang tải thông tin của bé" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        ))}
    </>
  );

  if (!multiple) return <div className="flex min-w-0 items-center gap-2 rounded-full py-0.5 pl-0.5 pr-2">{body}</div>;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Đang xem bé ${givenName(selected.full_name)} — chạm để đổi bé`}
        className="tap flex min-w-0 items-center gap-2 rounded-full bg-muted/70 py-0.5 pl-0.5 pr-2 ring-1 ring-border transition-colors active:bg-muted"
      >
        {body}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Chọn bé</SheetTitle>
            <SheetDescription>Thông tin trên ứng dụng sẽ hiển thị theo bé được chọn.</SheetDescription>
          </SheetHeader>
          <ul className="space-y-2">
            {kids.map((k) => {
              const active = k.id === selected.id;
              return (
                <li key={k.id}>
                  <button
                    type="button"
                    onClick={() => choose(k.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 transition-colors active:scale-[0.99]",
                      active ? "bg-primary/10 ring-primary/40" : "bg-card ring-border active:bg-muted",
                    )}
                  >
                    <StudentAvatar student={k} className="size-12" />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-bold">{k.full_name}</span>
                      <span className="block text-xs text-muted-foreground">
                        Lớp {k.class_name} · {CAMPUS_LABELS[k.campus]}
                      </span>
                    </span>
                    {active && <Check className="size-5 text-primary" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
