import { Cake, MapPin, School } from "lucide-react";
import { CAMPUS_LABELS } from "@/config/constants";
import { ageFrom } from "@/lib/date";
import type { Tables } from "@/types/database.types";
import { StudentAvatar } from "@/components/shared/student-avatar";

export function StudentCard({ student, today }: { student: Tables<"students">; today: string }) {
  const age = student.dob ? ageFrom(student.dob, today) : null;

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-edu-blue-500 via-edu-blue to-edu-blue-800 p-5 text-white shadow-lg shadow-edu-blue/25">
      {/* Điểm nhấn thương hiệu: ánh cam pastel (năng động) + xanh lá non (phát triển) dạng quầng sáng mờ — không làm đục nền xanh */}
      <div aria-hidden className="absolute -right-10 -top-14 size-40 rounded-full bg-white/15" />
      <div aria-hidden className="absolute -bottom-16 right-4 size-36 rounded-full bg-edu-peach-300/40 blur-2xl" />
      <div aria-hidden className="absolute -left-8 top-1/2 size-24 rounded-full bg-edu-leaf-300/30 blur-2xl" />
      <span aria-hidden className="absolute right-5 top-4 text-2xl">
        ⭐
      </span>

      <div className="relative flex items-center gap-4">
        <StudentAvatar student={student} className="size-16 text-2xl ring-4 ring-white/40" />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/80">Học sinh</p>
          <h1 className="break-words text-2xl font-extrabold leading-tight tracking-tight">{student.full_name}</h1>
        </div>
      </div>

      <ul className="relative mt-4 flex flex-wrap gap-2 text-xs font-semibold">
        <li className="flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 ring-1 ring-white/25 backdrop-blur-sm">
          <School className="size-3.5" /> Lớp {student.class_name}
        </li>
        <li className="flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 backdrop-blur-sm">
          <MapPin className="size-3.5" /> {CAMPUS_LABELS[student.campus]}
        </li>
        {age !== null && age >= 0 && (
          <li className="flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 backdrop-blur-sm">
            <Cake className="size-3.5" /> {age} tuổi
          </li>
        )}
      </ul>
    </section>
  );
}
