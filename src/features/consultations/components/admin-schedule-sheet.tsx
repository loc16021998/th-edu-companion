"use client";

import { useMemo, useState, useTransition } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { addDays, todayVN } from "@/lib/date";
import { cn } from "@/lib/utils";
import { adminScheduleConsultation } from "../actions";
import { CONSULT_MODES, MEETING_MINUTES, MODE_LABELS, type ConsultMode } from "../constants";
import type { Person } from "../queries";

type Kind = "me-parent" | "me-teacher" | "arrange";
const KINDS: { value: Kind; label: string; hint: string }[] = [
  { value: "me-parent", label: "Tôi ↔ Phụ huynh", hint: "Ban quản lý trao đổi trực tiếp với phụ huynh" },
  { value: "me-teacher", label: "Tôi ↔ Giáo viên", hint: "Họp 1-1 với giáo viên" },
  { value: "arrange", label: "Giáo viên ↔ Phụ huynh", hint: "Sắp xếp buổi trao đổi giữa cô và phụ huynh" },
];

const chip = (on: boolean) => cn("rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition-colors", on ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border hover:bg-muted");
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();

/** Chọn 1 người: ô tìm kiếm (không dấu cũng được) + danh sách lọc. Phụ huynh tìm được theo tên bé. */
function PersonPicker({ id, label, people, value, onChange }: { id: string; label: string; people: Person[]; value: string; onChange: (id: string) => void }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const k = norm(q.trim());
    const list = k ? people.filter((p) => norm(p.name).includes(k) || p.children.some((c) => norm(c.name).includes(k))) : people;
    return list.slice(0, 200);
  }, [people, q]);
  const describe = (p: Person) => (p.children.length ? `${p.name} — bé ${p.children.map((c) => `${c.name} (${c.className})`).join(", ")}` : p.name);
  return (
    <div className="space-y-1">
      <Label htmlFor={`${id}-q`}>{label}</Label>
      <Input id={`${id}-q`} type="search" placeholder="Gõ tên để tìm (phụ huynh: tìm được theo tên bé)" value={q} onChange={(e) => setQ(e.target.value)} />
      {/* Danh sách tự xuống dòng (select gốc cắt chữ dài trên điện thoại) */}
      <div id={id} role="radiogroup" aria-label={label} className="max-h-48 overflow-y-auto rounded-md border border-input bg-background p-1">
        {shown.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={value === p.id}
            onClick={() => onChange(p.id)}
            className={cn("block w-full break-words rounded px-2 py-1.5 text-left text-sm", value === p.id ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            {describe(p)}
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="text-xs text-muted-foreground">Không tìm thấy.</p>}
    </div>
  );
}

/** Quản trị viên chủ động lên lịch hẹn (xác nhận ngay, các bên nhận thông báo + nhắc trước 30 phút). */
export function AdminScheduleButton({ meId, people }: { meId: string; people: Person[] }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("me-parent");
  const [teacherId, setTeacherId] = useState("");
  const [guestId, setGuestId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [date, setDate] = useState(() => addDays(todayVN(), 1));
  const [time, setTime] = useState("16:00");
  const [minutes, setMinutes] = useState<number>(30);
  const [mode, setMode] = useState<ConsultMode>("online");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [location, setLocation] = useState("");
  const [topic, setTopic] = useState("");
  const [pending, startTransition] = useTransition();

  const parents = useMemo(() => people.filter((p) => p.role === "parent" && p.children.length > 0), [people]);
  const teachers = useMemo(() => people.filter((p) => p.role === "teacher"), [people]);
  const guestList = kind === "me-teacher" ? teachers : parents;
  const guest = people.find((p) => p.id === guestId);
  const children = guest?.role === "parent" ? guest.children : [];

  function pickKind(k: Kind) {
    setKind(k);
    setGuestId("");
    setStudentId("");
  }
  function pickGuest(id: string) {
    setGuestId(id);
    const kids = people.find((p) => p.id === id)?.children ?? [];
    setStudentId(kids.length === 1 ? kids[0]!.id : "");
  }

  function submit() {
    startTransition(async () => {
      const res = await adminScheduleConsultation({
        hostId: kind === "arrange" ? teacherId : meId,
        guestId,
        studentId: kind === "me-teacher" ? null : studentId || null,
        date,
        time,
        minutes,
        mode,
        topic,
        meetingUrl: mode === "online" ? meetingUrl : "",
        location: mode === "in_person" ? location : "",
      });
      if (!res.ok) return toast.error("Chưa lên được lịch", res.error);
      toast.success("Đã lên lịch hẹn", "Các bên nhận thông báo ngay và được nhắc trước giờ hẹn 30 phút.");
      setOpen(false);
      setTopic("");
      setGuestId("");
      setStudentId("");
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <CalendarPlus className="size-4" /> Lên lịch hẹn
      </Button>
      <Sheet open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <SheetContent locked={pending} className="sm:max-w-lg">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <SheetHeader>
              <SheetTitle>Lên lịch hẹn trao đổi</SheetTitle>
              <SheetDescription>Lịch được xác nhận ngay — không cần chờ khung giờ rảnh. Hệ thống báo lỗi nếu ai đó đã có lịch trùng giờ.</SheetDescription>
            </SheetHeader>

            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Loại buổi hẹn</legend>
              <div className="flex flex-wrap gap-1.5">
                {KINDS.map((k) => (
                  <button key={k.value} type="button" aria-pressed={kind === k.value} onClick={() => pickKind(k.value)} className={chip(kind === k.value)}>
                    {k.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{KINDS.find((k) => k.value === kind)?.hint}</p>
            </fieldset>

            {kind === "arrange" && <PersonPicker id="sched-teacher" label="Giáo viên chủ trì" people={teachers} value={teacherId} onChange={setTeacherId} />}
            <PersonPicker id="sched-guest" label={kind === "me-teacher" ? "Giáo viên" : "Phụ huynh"} people={guestList} value={guestId} onChange={pickGuest} />

            {children.length > 1 && (
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">Trao đổi về bé</legend>
                <div className="flex flex-wrap gap-1.5">
                  {children.map((c) => (
                    <button key={c.id} type="button" aria-pressed={studentId === c.id} onClick={() => setStudentId(c.id)} className={chip(studentId === c.id)}>
                      {c.name} · {c.className}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="sched-date">Ngày</Label>
                <Input id="sched-date" type="date" required min={todayVN()} max={addDays(todayVN(), 90)} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sched-time">Giờ</Label>
                <Input id="sched-time" type="time" required step={300} value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>

            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Thời lượng</legend>
              <div className="flex flex-wrap gap-1.5">
                {MEETING_MINUTES.map((m) => (
                  <button key={m} type="button" aria-pressed={minutes === m} onClick={() => setMinutes(m)} className={chip(minutes === m)}>
                    {m} phút
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Hình thức</legend>
              <div className="flex flex-wrap gap-1.5">
                {CONSULT_MODES.map((m) => (
                  <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={chip(mode === m)}>
                    {MODE_LABELS[m].emoji} {MODE_LABELS[m].short}
                  </button>
                ))}
              </div>
            </fieldset>
            {mode === "online" && (
              <div className="space-y-1">
                <Label htmlFor="sched-url">Link phòng họp</Label>
                <Input id="sched-url" type="url" inputMode="url" placeholder="https://meet.google.com/..." value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} />
              </div>
            )}
            {mode === "in_person" && (
              <div className="space-y-1">
                <Label htmlFor="sched-loc">Địa điểm</Label>
                <Input id="sched-loc" maxLength={160} placeholder="VD: Phòng tiếp phụ huynh — CS1 Xa La" value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="sched-topic">Nội dung trao đổi</Label>
              <Textarea id="sched-topic" rows={3} required minLength={5} maxLength={500} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="VD: Trao đổi kết quả học tập giữa kỳ của bé" />
            </div>

            <Button type="submit" className="w-full" disabled={pending || !guestId || (kind === "arrange" && !teacherId) || (kind !== "me-teacher" && !studentId)}>
              {pending && <Loader2 className="size-4 animate-spin" />} Lên lịch & gửi thông báo
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
