import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Section({
  title,
  icon: Icon,
  iconClassName,
  aside,
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  iconClassName?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <span className={cn("flex size-7 items-center justify-center rounded-lg", iconClassName)}>
            <Icon className="size-4" />
          </span>
          {title}
        </h2>
        {aside && <div className="text-xs font-medium text-muted-foreground">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ emoji, title, description }: { emoji: string; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card px-6 py-8 text-center">
      <span className="text-4xl" aria-hidden>
        {emoji}
      </span>
      <p className="mt-2 font-semibold">{title}</p>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}
