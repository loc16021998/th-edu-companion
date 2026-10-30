"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, BookOpen, Check, Loader2, Pencil, Phone, Search, Trash2, UserPen, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, SubmitButton, fieldClass, useFormAction } from "@/components/shared/form-field";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { CAMPUS_LABELS, SUBJECTS, type SubjectKey } from "@/config/constants";
import { SUBJECT_KEYS, enrolledSubjects } from "@/lib/subjects";
import { ageFrom, fullDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { findParentByPhone, updateStudent } from "@/features/center/actions";
import { createStudent, deleteStudent, updateStudentSubjects } from "../actions";
import type { ClassRow, PersonOption, StudentRow } from "../queries";
import { confirmSheet } from "@/components/ui/confirm-sheet";

type ParentMode = "none" | "existing" | "new";

const PARENT_MODES: { value: ParentMode; label: string }[] = [
  { value: "existing", label: "Đã có tài khoản" },
  { value: "new", label: "Tạo tài khoản mới" },
  { value: "none", label: "Bổ sung sau" },
];

function CreateStudentForm({ classes, parents, today }: { classes: ClassRow[]; parents: PersonOption[]; today: string }) {
  const { state, pending, formRef, onSubmit, errors: err } = useFormAction(createStudent);
  const [subjects, setSubjects] = useState<SubjectKey[]>(SUBJECT_KEYS);
  const [mode, setMode] = useState<ParentMode>(parents.length > 0 ? "existing" : "new");

  if (classes.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
        Chưa có lớp học nào — hãy tạo lớp ở tab <b>Lớp học</b> trước khi thêm học sinh.
      </p>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} onReset={() => setSubjects(SUBJECT_KEYS)} className="space-y-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
      <h2 className="flex items-center gap-2 font-bold">
        <UserPlus className="size-5 text-primary" /> Thêm học sinh
      </h2>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Họ và tên học sinh" htmlFor="s-name" error={err.fullName}>
          <input id="s-name" name="fullName" className={fieldClass} required autoComplete="off" aria-invalid={!!err.fullName} />
        </Field>
        <Field label="Ngày sinh" htmlFor="s-dob" error={err.dob}>
          <input id="s-dob" name="dob" type="date" max={today} className={fieldClass} />
        </Field>
        <Field label="Lớp" htmlFor="s-class" error={err.classId}>
          <select id="s-class" name="classId" className={fieldClass} required defaultValue={classes[0]?.id}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-muted-foreground">Môn học đăng ký</legend>
        <SubjectPicker value={subjects} onChange={setSubjects} name="subjects" />
        {err.subjects && <p className="text-xs font-medium text-destructive">{err.subjects}</p>}
      </fieldset>

      <fieldset className="space-y-3 rounded-xl bg-muted/50 p-3">
        <legend className="sr-only">Phụ huynh</legend>
        <p className="text-xs font-semibold text-muted-foreground">Tài khoản phụ huynh (để theo dõi con)</p>
        <input type="hidden" name="parentMode" value={mode} />
        <div role="radiogroup" aria-label="Tài khoản phụ huynh" className="grid grid-cols-3 gap-1 rounded-xl bg-background p-1 ring-1 ring-border">
          {PARENT_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={mode === m.value}
              onClick={() => setMode(m.value)}
              className={cn(
                "h-9 rounded-lg text-xs font-semibold transition-colors sm:text-sm",
                mode === m.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === "existing" &&
          (parents.length === 0 ? (
            <p className="text-xs text-muted-foreground">Chưa có tài khoản phụ huynh nào — chọn “Tạo tài khoản mới”.</p>
          ) : (
            <Field label="Chọn phụ huynh" htmlFor="s-parent" error={err.parentId}>
              <select id="s-parent" name="parentId" className={fieldClass} defaultValue="">
                <option value="" disabled>
                  — Chọn phụ huynh —
                </option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || "(Chưa có tên)"}
                    {p.phone ? ` · ${p.phone}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          ))}

        {mode === "new" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Họ tên phụ huynh" htmlFor="p-name" error={err.parentFullName}>
              <input id="p-name" name="parentFullName" className={fieldClass} autoComplete="off" />
            </Field>
            <Field label="Số điện thoại" htmlFor="p-phone" error={err.parentPhone}>
              <input id="p-phone" name="parentPhone" type="tel" inputMode="tel" className={fieldClass} placeholder="0912 345 678" />
            </Field>
            <Field label="Email (không bắt buộc)" htmlFor="p-email" error={err.parentEmail}>
              <input id="p-email" name="parentEmail" type="email" className={fieldClass} autoComplete="off" />
            </Field>
            <Field label="Mật khẩu đăng nhập" htmlFor="p-password" error={err.parentPassword} hint="Tối thiểu 8 ký tự — gửi cho phụ huynh.">
              <input id="p-password" name="parentPassword" type="text" className={fieldClass} minLength={8} autoComplete="new-password" />
            </Field>
          </div>
        )}
      </fieldset>

      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingText="Đang lưu..." className="w-full sm:w-auto">
        <UserPlus /> Thêm học sinh
      </SubmitButton>
    </form>
  );
}

/**
 * Chọn môn đăng ký (ít nhất 1). `name`: gửi kèm form qua các ô tick ẩn cùng tên (form thêm học sinh).
 */
function SubjectPicker({ value, onChange, name }: { value: SubjectKey[]; onChange: (v: SubjectKey[]) => void; name?: string }) {
  const toggle = (k: SubjectKey) => {
    const next = value.includes(k) ? value.filter((x) => x !== k) : SUBJECT_KEYS.filter((x) => x === k || value.includes(x));
    if (next.length > 0) onChange(next); // luôn giữ ít nhất 1 môn
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {SUBJECT_KEYS.map((k) => {
        const on = value.includes(k);
        return (
          <label
            key={k}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors",
              on ? "bg-primary text-primary-foreground ring-primary" : "bg-background text-muted-foreground ring-border",
            )}
          >
            <input type="checkbox" className="sr-only" name={name} value={k} checked={on} onChange={() => toggle(k)} />
            {on ? <Check className="size-3.5" /> : <span className="size-3.5" aria-hidden />}
            {SUBJECTS[k]}
          </label>
        );
      })}
    </div>
  );
}

/** Sửa học sinh: họ tên, ngày sinh, chuyển lớp, liên kết phụ huynh qua SĐT (để trống = bỏ liên kết). */
function StudentEditor({ student, classes, today, onDone }: { student: StudentRow; classes: ClassRow[]; today: string; onDone: () => void }) {
  const router = useRouter();
  const currentClass = classes.find((c) => c.campus === student.campus && c.name === student.class_name);
  const [name, setName] = useState(student.full_name);
  const [dob, setDob] = useState(student.dob ?? "");
  const [classId, setClassId] = useState(currentClass?.id ?? classes[0]?.id ?? "");
  const [phone, setPhone] = useState(student.parent?.phone?.replace(/^\+?84/, "0") ?? "");
  const [lookup, setLookup] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const moving = currentClass && classId !== currentClass.id;

  function check() {
    setLookup(null);
    if (!phone.trim()) return setLookup({ tone: "warn", text: "Để trống = bỏ liên kết phụ huynh." });
    startTransition(async () => {
      const res = await findParentByPhone(phone);
      if (!res.ok) return setLookup({ tone: "warn", text: res.error });
      setLookup(
        res.data
          ? { tone: "ok", text: `Tìm thấy phụ huynh: ${res.data.full_name || "(chưa có tên)"}` }
          : { tone: "warn", text: "Chưa có tài khoản phụ huynh với SĐT này — tạo ở mục Cấp tài khoản trước." },
      );
    });
  }

  async function save() {
    setError(null);
    if (moving && !(await confirmSheet({ title: `Chuyển ${name} sang ${classes.find((c) => c.id === classId)?.label}?`, confirmLabel: "Chuyển lớp" }))) return;
    startTransition(async () => {
      const res = await updateStudent({ studentId: student.id, fullName: name, dob: dob || null, classId, parentPhone: phone });
      if (!res.ok) return setError(res.error);
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="mt-2 space-y-3 rounded-xl bg-muted/50 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Họ và tên" htmlFor={`en-${student.id}`}>
          <input id={`en-${student.id}`} value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} />
        </Field>
        <Field label="Ngày sinh" htmlFor={`ed-${student.id}`}>
          <input id={`ed-${student.id}`} type="date" max={today} value={dob} onChange={(e) => setDob(e.target.value)} className={fieldClass} />
        </Field>
        <Field label="Lớp (chuyển lớp)" htmlFor={`ec-${student.id}`} hint={moving ? "Điểm danh, sổ liên lạc cũ vẫn giữ nguyên." : undefined}>
          <select id={`ec-${student.id}`} value={classId} onChange={(e) => setClassId(e.target.value)} className={fieldClass}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="SĐT tài khoản phụ huynh" htmlFor={`ep-${student.id}`}>
          <div className="flex gap-1.5">
            <input
              id={`ep-${student.id}`}
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setLookup(null);
              }}
              onBlur={() => phone.trim() && check()}
              placeholder="Để trống = chưa liên kết"
              className={fieldClass}
            />
            <Button type="button" variant="outline" className="h-11 shrink-0 rounded-xl" onClick={check} disabled={pending}>
              <Search /> Kiểm tra
            </Button>
          </div>
        </Field>
      </div>
      {lookup && <p className={cn("text-xs font-medium", lookup.tone === "ok" ? "text-emerald-700" : "text-amber-700")}>{lookup.text}</p>}
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" className="h-10 rounded-xl" onClick={save} disabled={pending || !name.trim()}>
          {pending ? <Loader2 className="animate-spin" /> : moving ? <ArrowRightLeft /> : <Check />} {moving ? "Lưu & chuyển lớp" : "Lưu"}
        </Button>
        <Button type="button" variant="ghost" className="h-10 rounded-xl" onClick={onDone} disabled={pending}>
          <X /> Huỷ
        </Button>
      </div>
    </div>
  );
}

function StudentItem({ student, classes, today }: { student: StudentRow; classes: ClassRow[]; today: string }) {
  const [editingInfo, setEditingInfo] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const enrolled = enrolledSubjects(student);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SubjectKey[]>(enrolled);

  function saveSubjects() {
    setError(null);
    startTransition(async () => {
      const res = await updateStudentSubjects(student.id, draft);
      if (!res.ok) return setError(res.error);
      setEditing(false);
    });
  }

  async function remove() {
    if (!(await confirmSheet({ title: `Xoá học sinh ${student.full_name}?`, description: "Toàn bộ điểm danh, sổ liên lạc và học phí của bé cũng bị xoá.", confirmLabel: "Xoá học sinh", tone: "danger" }))) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteStudent(student.id);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <li className={cn("flex items-start gap-3 p-3", pending && "opacity-60")}>
      <StudentAvatar student={student} className="size-10 text-sm" />
      <div className="min-w-0 flex-1">
        <p className="break-words font-semibold">{student.full_name}</p>
        <p className="break-words text-xs text-muted-foreground">
          {student.dob ? `${fullDate(student.dob)} · ${ageFrom(student.dob, today)} tuổi` : "Chưa có ngày sinh"}
        </p>
        <p className={cn("flex items-center gap-1 break-words text-xs", student.parent ? "text-muted-foreground" : "font-medium text-amber-600")}>
          {student.parent ? (
            <>
              PH: {student.parent.full_name || "(Chưa có tên)"}
              {student.parent.phone && (
                <>
                  <Phone className="ml-1 size-3" /> {student.parent.phone}
                </>
              )}
            </>
          ) : (
            "Chưa liên kết phụ huynh"
          )}
        </p>
        {/* Môn đăng ký — phụ huynh chỉ xem tiến bộ các môn này */}
        {editing ? (
          <div className="mt-1.5 space-y-1.5">
            <SubjectPicker value={draft} onChange={setDraft} />
            <div className="flex gap-1.5">
              <Button type="button" size="sm" className="h-8 rounded-lg" onClick={saveSubjects} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Check />} Lưu môn
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 rounded-lg"
                disabled={pending}
                onClick={() => {
                  setDraft(enrolled);
                  setEditing(false);
                }}
              >
                <X /> Huỷ
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <BookOpen className="size-3.5 text-muted-foreground" />
            {enrolled.map((k) => (
              <span key={k} className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
                {SUBJECTS[k]}
              </span>
            ))}
            <button
              type="button"
              onClick={() => {
                setDraft(enrolled);
                setEditing(true);
              }}
              className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold text-primary hover:bg-accent"
            >
              <Pencil className="size-3" /> Sửa môn
            </button>
          </div>
        )}
        {error && <p className="text-xs font-medium text-destructive">{error}</p>}
        {editingInfo && <StudentEditor student={student} classes={classes} today={today} onDone={() => setEditingInfo(false)} />}
      </div>
      <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setEditingInfo((v) => !v)}
          disabled={pending}
          aria-label={`Sửa thông tin ${student.full_name}`}
          title="Sửa thông tin, chuyển lớp, liên kết phụ huynh"
        >
          <UserPen />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={remove} disabled={pending} aria-label={`Xoá ${student.full_name}`}>
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

export function StudentManager({
  classes,
  parents,
  students,
  today,
}: {
  classes: ClassRow[];
  parents: PersonOption[];
  students: StudentRow[];
  today: string;
}) {
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("all");

  const groups = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("vi");
    return classes
      .filter((c) => classFilter === "all" || c.id === classFilter)
      .map((c) => ({
        cls: c,
        students: students.filter(
          (s) =>
            s.campus === c.campus &&
            s.class_name === c.name &&
            (!q || s.full_name.toLocaleLowerCase("vi").includes(q) || s.parent?.full_name.toLocaleLowerCase("vi").includes(q)),
        ),
      }))
      .filter((g) => g.students.length > 0 || (!q && classFilter !== "all"));
  }, [classes, students, query, classFilter]);

  return (
    <div className="space-y-5">
      <CreateStudentForm classes={classes} parents={parents} today={today} />

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Danh sách học sinh ({students.length})</h2>
        <div className="grid gap-2 sm:grid-cols-[1fr_16rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm học sinh hoặc phụ huynh..."
              aria-label="Tìm học sinh"
              className={cn(fieldClass, "pl-9")}
            />
          </div>
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} aria-label="Lọc theo lớp" className={fieldClass}>
            <option value="all">Tất cả lớp</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {groups.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            {students.length === 0 ? "Chưa có học sinh nào." : "Không tìm thấy học sinh phù hợp."}
          </p>
        ) : (
          groups.map(({ cls, students: list }) => (
            <div key={cls.id} className="space-y-2">
              <p className="flex items-center justify-between text-sm font-bold">
                <span>
                  Lớp {cls.name} <span className="font-medium text-muted-foreground">· {CAMPUS_LABELS[cls.campus]}</span>
                </span>
                <span className="text-xs font-semibold text-muted-foreground">{list.length} học sinh</span>
              </p>
              {list.length === 0 ? (
                <p className="rounded-2xl border border-dashed bg-card p-4 text-center text-xs text-muted-foreground">Lớp chưa có học sinh.</p>
              ) : (
                <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
                  {list.map((s) => (
                    <StudentItem key={`${s.id}-${s.class_name}-${s.parent?.id ?? ""}`} student={s} classes={classes} today={today} />
                  ))}
                </ul>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
