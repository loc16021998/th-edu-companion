import { cn, givenName } from "@/lib/utils";
import { MediaImage } from "./media-image";

const PALETTE = ["bg-amber-400", "bg-rose-400", "bg-emerald-400", "bg-violet-400", "bg-sky-400", "bg-orange-400"];

function colorFor(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function StudentAvatar({
  student,
  className,
}: {
  student: { id: string; full_name: string; avatar_url: string | null };
  className?: string;
}) {
  const src = student.avatar_url && /^https?:\/\//.test(student.avatar_url) ? student.avatar_url : null;

  return (
    <span
      className={cn(
        "relative inline-flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white",
        !src && colorFor(student.id),
        className,
      )}
    >
      {src ? (
        <MediaImage src={src} alt={student.full_name} fill sizes="64px" className="object-cover" />
      ) : (
        <span aria-hidden>{givenName(student.full_name).charAt(0).toUpperCase()}</span>
      )}
    </span>
  );
}
