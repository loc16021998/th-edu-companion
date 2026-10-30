"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Mail, Pencil, Phone, Search, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, SubmitButton, fieldClass, useFormAction } from "@/components/shared/form-field";
import { CAMPUS_LABELS } from "@/config/constants";
import { cn } from "@/lib/utils";
import { createTeacher, deleteTeacher, updateTeacher } from "../actions";
import { CAMPUS_COLOR, CAMPUS_LIST, CAMPUS_SHORT, type Campus } from "../constants";
import type { TeacherRow } from "../queries";
import { confirmSheet } from "@/components/ui/confirm-sheet";

export type ClassOption = { id: string; campus: Campus; name: string; studentCount: number };
type Scope = { campusWide: Campus[]; classIds: string[] };

/**
 * Phân quyền: tick "Toàn bộ cơ sở" → giáo viên xem / điểm danh mọi lớp của cơ sở đó;
 * hoặc chọn từng lớp phụ trách. `withInputs`: kèm ô tick ẩn để gửi theo form.
 */
function ScopePicker({ classes, value, onChange, withInputs }: { classes: ClassOption[]; value: Scope; onChange: (v: Scope) => void; withInputs?: boolean }) {
  const toggleCampus = (c: Campus) =>
    onChange({ ...value, campusWide: value.campusWide.includes(c) ? value.campusWide.filter((x) => x !== c) : [...value.campusWide, c] });
  const toggleClass = (id: string) =>
    onChange({ ...value, classIds: value.classIds.includes(id) ? value.classIds.filter((x) => x !== id) : [...value.classIds, id] });

  return (
    <div className="space-y-3">
      {CAMPUS_LIST.map((campus) => {
        const wide = value.campusWide.includes(campus);
        const list = classes.filter((c) => c.campus === campus);
        return (
          <div key={campus} className="space-y-2 rounded-xl bg-background p-3 ring-1 ring-border">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                name={withInputs ? "campusWide" : undefined}
                value={campus}
                checked={wide}
                onChange={() => toggleCampus(campus)}
                className="size-4 accent-primary"
              />
              <span className="size-2.5 rounded-full" style={{ background: CAMPUS_COLOR[campus] }} aria-hidden />
              Toàn bộ {CAMPUS_SHORT[campus]}
            </label>
            {list.length === 0 ? (
              <p className="text-xs text-muted-foreground">Cơ sở chưa có lớp.</p>
            ) : (
              <div className={cn("flex flex-wrap gap-1.5", wide && "pointer-events-none opacity-50")} aria-disabled={wide}>
                {list.map((c) => {
                  const on = wide || value.classIds.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition-colors",
                        on ? "bg-primary text-primary-foreground ring-primary" : "bg-card text-muted-foreground ring-border hover:bg-muted",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        name={withInputs && !wide ? "classIds" : undefined}
                        value={c.id}
                        checked={on}
                        disabled={wide}
                        onChange={() => toggleClass(c.id)}
                      />
                      {on && <Check className="size-3" />}
                      Lớp {c.name}
                      <span className="opacity-70">({c.studentCount})</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CreateTeacherForm({ classes }: { classes: ClassOption[] }) {
  const { state, pending, formRef, onSubmit, errors: err } = useFormAction(createTeacher);
  const [scope, setScope] = useState<Scope>({ campusWide: [], classIds: [] });

  return (
    <form ref={formRef} onSubmit={onSubmit} onReset={() => setScope({ campusWide: [], classIds: [] })} className="space-y-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
      <h2 className="flex items-center gap-2 font-bold">
        <UserPlus className="size-5 text-primary" /> Tạo tài khoản giáo viên
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Họ và tên" htmlFor="t-name" error={err.fullName}>
          <input id="t-name" name="fullName" className={fieldClass} required autoComplete="off" aria-invalid={!!err.fullName} />
        </Field>
        <Field label="Số điện thoại (đăng nhập)" htmlFor="t-phone" error={err.phone}>
          <input id="t-phone" name="phone" type="tel" inputMode="tel" className={fieldClass} autoComplete="off" aria-invalid={!!err.phone} />
        </Field>
        <Field label="Email (không bắt buộc)" htmlFor="t-email" error={err.email}>
          <input id="t-email" name="email" type="email" className={fieldClass} autoComplete="off" aria-invalid={!!err.email} />
        </Field>
        <Field label="Mật khẩu đăng nhập" htmlFor="t-password" error={err.password} hint="Tối thiểu 8 ký tự — gửi cho giáo viên.">
          <input id="t-password" name="password" type="text" minLength={8} className={fieldClass} autoComplete="new-password" aria-invalid={!!err.password} />
        </Field>
        <Field label="Cơ sở làm việc chính" htmlFor="t-campus" error={err.campus}>
          <select id="t-campus" name="campus" className={fieldClass} defaultValue={CAMPUS_LIST[0]}>
            {CAMPUS_LIST.map((c) => (
              <option key={c} value={c}>
                {CAMPUS_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-muted-foreground">Lớp phụ trách & quyền theo cơ sở</legend>
        <ScopePicker classes={classes} value={scope} onChange={setScope} withInputs />
      </fieldset>
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingText="Đang tạo..." className="w-full sm:w-auto">
        <UserPlus /> Tạo tài khoản giáo viên
      </SubmitButton>
    </form>
  );
}

function scopeOf(teacher: TeacherRow, classes: ClassOption[]): Scope {
  return {
    campusWide: teacher.assignments.filter((a) => a.class_name === null).map((a) => a.campus),
    classIds: teacher.assignments.flatMap((a) => classes.filter((c) => c.campus === a.campus && c.name === a.class_name).map((c) => c.id)),
  };
}

function TeacherCard({ teacher, classes }: { teacher: TeacherRow; classes: ClassOption[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(teacher.full_name);
  const currentPhone = teacher.phone?.replace(/^\+?84/, "0") ?? "";
  const [phone, setPhone] = useState(currentPhone);
  const [email, setEmail] = useState(teacher.email ?? "");
  const [campus, setCampus] = useState<Campus>(teacher.campus ?? CAMPUS_LIST[0]!);
  const [scope, setScope] = useState<Scope>(() => scopeOf(teacher, classes));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName(teacher.full_name);
    setPhone(currentPhone);
    setEmail(teacher.email ?? "");
    setCampus(teacher.campus ?? CAMPUS_LIST[0]!);
    setScope(scopeOf(teacher, classes));
    setError(null);
    setEditing(false);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      // Chỉ gửi SĐT / email khi đổi (đổi thông tin đăng nhập cần SUPABASE_SERVICE_ROLE_KEY)
      const phoneChanged = phone.replace(/\D/g, "") !== currentPhone.replace(/\D/g, "");
      const emailChanged = email.trim().toLowerCase() !== (teacher.email ?? "");
      if ((phoneChanged && !phone.trim()) || (emailChanged && !email.trim())) {
        return setError("Không xoá được SĐT / email đăng nhập — chỉ đổi sang giá trị mới.");
      }
      const res = await updateTeacher({
        teacherId: teacher.id,
        fullName: name,
        campus,
        ...scope,
        phone: phoneChanged ? phone : undefined,
        email: emailChanged ? email : undefined,
      });
      if (!res.ok) return setError(res.error);
      setEditing(false);
      router.refresh();
    });
  }

  async function remove() {
    if (!(await confirmSheet({ title: `Xoá tài khoản giáo viên ${teacher.full_name}?`, description: "Giáo viên sẽ không đăng nhập được nữa; sổ liên lạc đã viết vẫn được giữ.", confirmLabel: "Xoá tài khoản", tone: "danger" }))) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteTeacher(teacher.id);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <li className={cn("space-y-3 p-4", pending && "opacity-70")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {teacher.full_name || "(Chưa có tên)"}
            {teacher.campus ? (
              <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
                <span className="size-2 rounded-full" style={{ background: CAMPUS_COLOR[teacher.campus] }} aria-hidden />
                {CAMPUS_SHORT[teacher.campus]}
              </span>
            ) : (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">Chưa gán cơ sở</span>
            )}
          </p>
          <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            {teacher.phone && (
              <span className="flex items-center gap-1">
                <Phone className="size-3" /> {teacher.phone.replace(/^\+?84/, "0")}
              </span>
            )}
            {teacher.email && (
              <span className="flex items-center gap-1">
                <Mail className="size-3" /> {teacher.email}
              </span>
            )}
          </p>
          {!editing && (
            <div className="flex flex-wrap gap-1">
              {teacher.assignments.length === 0 ? (
                <span className="text-xs font-medium text-amber-700">Chưa phân lớp</span>
              ) : (
                teacher.assignments.map((a) => (
                  <span key={`${a.campus}:${a.class_name}`} className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
                    {a.class_name ? `Lớp ${a.class_name} · ${a.campus === "CS1_XALA" ? "CS1" : "CS2"}` : `Toàn bộ ${CAMPUS_SHORT[a.campus]}`}
                  </span>
                ))
              )}
            </div>
          )}
        </div>
        {!editing && (
          <div className="flex shrink-0 gap-1">
            <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => setEditing(true)} disabled={pending}>
              <Pencil /> Sửa
            </Button>
            <Button type="button" variant="ghost" size="icon" className="size-9 text-destructive" onClick={remove} disabled={pending} aria-label={`Xoá ${teacher.full_name}`}>
              {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
            </Button>
          </div>
        )}
      </div>

      {editing && (
        <div className="space-y-3 rounded-xl bg-muted/50 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Họ và tên" htmlFor={`tn-${teacher.id}`}>
              <input id={`tn-${teacher.id}`} value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} />
            </Field>
            <Field label="SĐT đăng nhập" htmlFor={`tp-${teacher.id}`}>
              <input id={`tp-${teacher.id}`} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={fieldClass} placeholder="0912 345 678" />
            </Field>
            <Field label="Email đăng nhập" htmlFor={`te-${teacher.id}`}>
              <input id={`te-${teacher.id}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClass} placeholder="Không bắt buộc" />
            </Field>
            <Field label="Cơ sở làm việc chính" htmlFor={`tc-${teacher.id}`}>
              <select id={`tc-${teacher.id}`} value={campus} onChange={(e) => setCampus(e.target.value as Campus)} className={fieldClass}>
                {CAMPUS_LIST.map((c) => (
                  <option key={c} value={c}>
                    {CAMPUS_LABELS[c]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <ScopePicker classes={classes} value={scope} onChange={setScope} />
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" className="h-10 rounded-xl" onClick={save} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Check />} Lưu
            </Button>
            <Button type="button" variant="ghost" className="h-10 rounded-xl" onClick={reset} disabled={pending}>
              <X /> Huỷ
            </Button>
          </div>
        </div>
      )}
      {!editing && error && <p className="text-sm font-medium text-destructive">{error}</p>}
    </li>
  );
}

export function TeacherManager({ teachers, classes }: { teachers: TeacherRow[]; classes: ClassOption[] }) {
  const [query, setQuery] = useState("");
  const [campusFilter, setCampusFilter] = useState<"all" | Campus>("all");
  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("vi");
    return teachers.filter(
      (t) =>
        (campusFilter === "all" || t.campus === campusFilter || t.assignments.some((a) => a.campus === campusFilter)) &&
        (!q || t.full_name.toLocaleLowerCase("vi").includes(q) || t.phone?.includes(q) || t.email?.includes(q)),
    );
  }, [teachers, query, campusFilter]);

  return (
    <div className="space-y-5">
      <CreateTeacherForm classes={classes} />
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Danh sách giáo viên ({teachers.length})</h2>
        <div className="grid gap-2 sm:grid-cols-[1fr_16rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm theo tên, SĐT, email..." aria-label="Tìm giáo viên" className={cn(fieldClass, "pl-9")} />
          </div>
          <select value={campusFilter} onChange={(e) => setCampusFilter(e.target.value as "all" | Campus)} aria-label="Lọc theo cơ sở" className={fieldClass}>
            <option value="all">Tất cả cơ sở</option>
            {CAMPUS_LIST.map((c) => (
              <option key={c} value={c}>
                {CAMPUS_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        {shown.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            {teachers.length === 0 ? "Chưa có giáo viên nào." : "Không tìm thấy giáo viên phù hợp."}
          </p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
            {shown.map((t) => (
              <TeacherCard key={`${t.id}-${t.full_name}-${t.campus}-${t.assignments.length}`} teacher={t} classes={classes} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
