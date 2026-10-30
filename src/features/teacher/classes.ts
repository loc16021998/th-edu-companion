// Lớp học được suy ra từ danh sách học sinh mà RLS cho phép xem:
// giáo viên → lớp/cơ sở được phân công; admin → tất cả. Module thuần (dùng được ở client).
import { CAMPUS_LABELS } from "@/config/constants";
import { givenName } from "@/lib/utils";
import type { Enums, Tables } from "@/types/database.types";

type Campus = Enums<"campus">;
const CAMPUSES = Object.keys(CAMPUS_LABELS) as Campus[];

export type ClassGroup<S> = {
  key: string; // "CS1_XALA:K1A" — dùng trong URL ?class=
  campus: Campus;
  className: string;
  label: string;
  students: S[];
};

export function classKeyOf(campus: Campus, className: string) {
  return `${campus}:${className}`;
}

export function parseClassKey(key: unknown): { campus: Campus; className: string } | null {
  if (typeof key !== "string") return null;
  const i = key.indexOf(":");
  const campus = key.slice(0, i) as Campus;
  const className = key.slice(i + 1);
  return i > 0 && CAMPUSES.includes(campus) && className ? { campus, className } : null;
}

/** Nhóm theo lớp; học sinh sắp xếp theo tên gọi (quy ước Việt Nam), rồi họ tên đầy đủ. */
export function groupByClass<S extends Pick<Tables<"students">, "campus" | "class_name" | "full_name">>(
  students: S[],
): ClassGroup<S>[] {
  const groups = new Map<string, ClassGroup<S>>();
  for (const s of students) {
    const key = classKeyOf(s.campus, s.class_name);
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        campus: s.campus,
        className: s.class_name,
        label: `Lớp ${s.class_name} · ${CAMPUS_LABELS[s.campus]}`,
        students: [],
      };
      groups.set(key, g);
    }
    g.students.push(s);
  }

  const collator = new Intl.Collator("vi", { numeric: true, sensitivity: "base" });
  for (const g of groups.values()) {
    g.students.sort(
      (a, b) => collator.compare(givenName(a.full_name), givenName(b.full_name)) || collator.compare(a.full_name, b.full_name),
    );
  }
  return [...groups.values()].sort(
    (a, b) => CAMPUSES.indexOf(a.campus) - CAMPUSES.indexOf(b.campus) || collator.compare(a.className, b.className),
  );
}

export function pickClass<S>(groups: ClassGroup<S>[], key: unknown): ClassGroup<S> | null {
  return groups.find((g) => g.key === key) ?? groups[0] ?? null;
}
