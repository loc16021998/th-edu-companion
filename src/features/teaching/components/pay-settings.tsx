"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/shared/form-field";
import { toast } from "@/components/ui/toast";
import { SUBJECTS } from "@/config/constants";
import { cn, formatVND } from "@/lib/utils";
import type { Enums } from "@/types/database.types";
import { savePayRates, updateClassTeachingMeta } from "../actions";
import { PAY_SUBJECTS, PAY_SUBJECT_KEYS, campusShort, type PaySubject } from "../constants";

type Rate = { id: string; subject: string; teacher_id: string | null; rate: number };
type Override = { key: string; teacherId: string; subject: PaySubject; rate: string };

const toNum = (v: string) => (v.trim() === "" ? null : Math.round(Number(v.replace(/[.,\s]/g, ""))));

/** Đơn giá / buổi: mặc định theo môn + riêng từng giáo viên (ghi đè). */
export function PayRatesForm({ rates, teachers }: { rates: Rate[]; teachers: { id: string; full_name: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [defaults, setDefaults] = useState<Record<PaySubject, string>>(
    () =>
      Object.fromEntries(PAY_SUBJECT_KEYS.map((s) => [s, String(rates.find((r) => r.subject === s && !r.teacher_id)?.rate ?? "")])) as Record<
        PaySubject,
        string
      >,
  );
  const initialOverrides = rates
    .filter((r) => r.teacher_id)
    .map((r) => ({ key: r.id, teacherId: r.teacher_id!, subject: r.subject as PaySubject, rate: String(r.rate) }));
  const [overrides, setOverrides] = useState<Override[]>(initialOverrides);

  const save = () => {
    const bad = [...Object.values(defaults), ...overrides.map((o) => o.rate)].some((v) => v.trim() !== "" && !Number.isFinite(toNum(v)));
    if (bad) return toast.error("Đơn giá không hợp lệ", "Chỉ nhập số, vd 150000.");
    const removed = initialOverrides.filter((o) => !overrides.some((x) => x.teacherId === o.teacherId && x.subject === o.subject));
    const payload = [
      ...PAY_SUBJECT_KEYS.map((s) => ({ subject: s, teacherId: null, rate: toNum(defaults[s]) })),
      ...overrides.filter((o) => o.teacherId).map((o) => ({ subject: o.subject, teacherId: o.teacherId, rate: toNum(o.rate) })),
      ...removed.map((o) => ({ subject: o.subject, teacherId: o.teacherId, rate: null })),
    ];
    startTransition(async () => {
      const res = await savePayRates(payload);
      if (res.ok) toast.success("Đã lưu đơn giá", "Áp dụng cho các ca kết thúc từ bây giờ.");
      else toast.error("Chưa lưu được đơn giá", res.error);
    });
  };

  return (
    <section className="space-y-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
      <div>
        <h2 className="text-base font-bold">Đơn giá lương theo buổi</h2>
        <p className="text-sm text-muted-foreground">Lớp chưa đặt môn dùng đơn giá “Tổng hợp”. Đổi đơn giá chỉ áp dụng cho ca kết thúc sau khi lưu.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PAY_SUBJECT_KEYS.map((s) => (
          <label key={s} className="space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">{PAY_SUBJECTS[s]} (VNĐ / buổi)</span>
            <input
              inputMode="numeric"
              value={defaults[s]}
              onChange={(e) => setDefaults((d) => ({ ...d, [s]: e.target.value }))}
              placeholder="Vd: 150000"
              className={fieldClass}
            />
            {toNum(defaults[s]) ? <span className="block text-xs text-muted-foreground">{formatVND(toNum(defaults[s])!)}</span> : null}
          </label>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-bold">Đơn giá riêng từng giáo viên</p>
        {overrides.length === 0 && <p className="text-sm text-muted-foreground">Chưa có — mọi giáo viên dùng đơn giá mặc định.</p>}
        {overrides.map((o, i) => (
          <div key={o.key} className="grid gap-2 rounded-xl bg-muted/40 p-2 sm:grid-cols-[1fr_12rem_10rem_auto]">
            <select
              value={o.teacherId}
              aria-label="Giáo viên"
              onChange={(e) => setOverrides((list) => list.map((x, j) => (j === i ? { ...x, teacherId: e.target.value } : x)))}
              className={fieldClass}
            >
              <option value="">— Chọn giáo viên —</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
            <select
              value={o.subject}
              aria-label="Môn"
              onChange={(e) => setOverrides((list) => list.map((x, j) => (j === i ? { ...x, subject: e.target.value as PaySubject } : x)))}
              className={fieldClass}
            >
              {PAY_SUBJECT_KEYS.map((s) => (
                <option key={s} value={s}>
                  {PAY_SUBJECTS[s]}
                </option>
              ))}
            </select>
            <input
              inputMode="numeric"
              aria-label="Đơn giá"
              value={o.rate}
              onChange={(e) => setOverrides((list) => list.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))}
              placeholder="VNĐ / buổi"
              className={fieldClass}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 rounded-xl text-destructive"
              aria-label="Xoá dòng"
              onClick={() => setOverrides((list) => list.filter((_, j) => j !== i))}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-9 rounded-lg"
          onClick={() => setOverrides((list) => [...list, { key: crypto.randomUUID(), teacherId: "", subject: "tong_hop", rate: "" }])}
        >
          <Plus /> Thêm đơn giá riêng
        </Button>
      </div>

      <Button type="button" className="h-11 rounded-xl" disabled={pending} onClick={save}>
        {pending ? <Loader2 className="animate-spin" /> : <Save />} Lưu đơn giá
      </Button>
    </section>
  );
}

type ClassMeta = { id: string; campus: Enums<"campus">; name: string; subject: string | null; room: string | null; /** undefined = DB chưa có cột */ capacity?: number | null };

function ClassRow({ cls }: { cls: ClassMeta }) {
  const [subject, setSubject] = useState(cls.subject ?? "");
  const [room, setRoom] = useState(cls.room ?? "");
  const [capacity, setCapacity] = useState(cls.capacity ? String(cls.capacity) : "");
  const [pending, startTransition] = useTransition();
  const hasCapacity = cls.capacity !== undefined;
  const dirty = subject !== (cls.subject ?? "") || room !== (cls.room ?? "") || (hasCapacity && capacity !== (cls.capacity ? String(cls.capacity) : ""));

  const save = () =>
    startTransition(async () => {
      const res = await updateClassTeachingMeta({
        classId: cls.id,
        subject: (subject || null) as "luyen_chu" | null,
        room,
        ...(hasCapacity && { capacity: capacity.trim() ? Number(capacity) : null }),
      });
      if (res.ok) toast.success(`Đã lưu lớp ${cls.name}`);
      else toast.error("Chưa lưu được", res.error);
    });

  return (
    <li className={cn("grid items-center gap-2 p-3", hasCapacity ? "sm:grid-cols-[1fr_12rem_8rem_7rem_6rem]" : "sm:grid-cols-[1fr_12rem_9rem_6rem]")}>
      <p className="font-semibold">
        Lớp {cls.name} <span className="text-xs font-medium text-muted-foreground">· {campusShort(cls.campus)}</span>
      </p>
      <select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label={`Môn của lớp ${cls.name}`} className={fieldClass}>
        <option value="">Tổng hợp</option>
        {Object.entries(SUBJECTS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <input
        value={room}
        maxLength={40}
        onChange={(e) => setRoom(e.target.value)}
        placeholder="Phòng"
        aria-label={`Phòng của lớp ${cls.name}`}
        className={fieldClass}
      />
      {hasCapacity && (
        <input
          value={capacity}
          inputMode="numeric"
          onChange={(e) => setCapacity(e.target.value.replace(/D/g, ""))}
          placeholder="Sĩ số tối đa"
          aria-label={`Sĩ số tối đa của lớp ${cls.name}`}
          className={fieldClass}
        />
      )}
      <Button
        type="button"
        size="sm"
        variant={dirty ? "default" : "outline"}
        className={cn("h-11 rounded-xl", !dirty && "opacity-60")}
        disabled={!dirty || pending}
        onClick={save}
      >
        {pending ? <Loader2 className="animate-spin" /> : "Lưu"}
      </Button>
    </li>
  );
}

/** Môn dạy chính + phòng học của từng lớp (hiện trên lịch dạy, quyết định đơn giá). */
export function ClassMetaList({ classes }: { classes: ClassMeta[] }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 id="class-meta" className="text-base font-bold">
          Môn, phòng học & sĩ số tối đa của lớp
        </h2>
        <p className="text-sm text-muted-foreground">Giờ học theo ca ở mục Ca học. Giáo viên của lớp được đặt ở mục Lớp học.</p>
      </div>
      {classes.length === 0 ? (
        <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground shadow-sm ring-1 ring-border">Chưa có lớp nào.</p>
      ) : (
        <ul className="divide-y rounded-2xl bg-card shadow-sm ring-1 ring-border">
          {classes.map((c) => (
            <ClassRow key={`${c.id}:${c.subject}:${c.room}:${c.capacity}`} cls={c} />
          ))}
        </ul>
      )}
    </section>
  );
}
