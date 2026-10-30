"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Megaphone, Send, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormMessage, SubmitButton, fieldClass, useFormAction } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";
import { createAnnouncement, deleteAnnouncement } from "../actions";
import {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_CATEGORY_KEYS,
  AUDIENCES,
  AUDIENCE_LABEL,
  CAMPUS_COLOR,
  CAMPUS_LIST,
  CAMPUS_SHORT,
  type AnnouncementCategory,
  type AudienceChoice,
  type Campus,
} from "../constants";
import type { AnnouncementRow } from "../queries";
import { confirmSheet } from "@/components/ui/confirm-sheet";

export type AudienceClass = { id: string; campus: Campus; name: string };
/** Mỗi phụ huynh đã liên kết: cơ sở + các lớp của con (để ước tính số người nhận). */
export type AudienceParent = { campuses: Campus[]; classIds: string[] };

const TEMPLATES: Record<AnnouncementCategory, { title: string; body: string }> = {
  general: { title: "", body: "" },
  holiday: {
    title: "Thông báo lịch nghỉ lễ",
    body: "Trung tâm TH EDU trân trọng thông báo lịch nghỉ lễ:\n- Nghỉ từ ngày … đến hết ngày …\n- Các lớp học trở lại bình thường từ ngày …\nKính chúc quý phụ huynh và các con kỳ nghỉ vui vẻ!",
  },
  contest: {
    title: "Sân chơi Cuộc thi Luyện chữ đẹp",
    body: "Trung tâm tổ chức Cuộc thi Luyện chữ đẹp dành cho các con:\n- Thời gian: …\n- Hình thức: …\n- Giải thưởng: …\nPhụ huynh đăng ký cho con với cô chủ nhiệm trước ngày …",
  },
  extracurricular: {
    title: "Chương trình ngoại khoá",
    body: "Trung tâm tổ chức chương trình ngoại khoá: …\n- Thời gian: …\n- Địa điểm: …\n- Chi phí: …\nPhụ huynh xác nhận cho con tham gia trước ngày …",
  },
};

function countRecipients(audience: AudienceChoice, classIds: string[], parents: AudienceParent[]) {
  if (audience === "all") return parents.length;
  if (audience === "classes") return parents.filter((p) => p.classIds.some((id) => classIds.includes(id))).length;
  return parents.filter((p) => p.campuses.includes(audience)).length;
}

function AnnouncementForm({ classes, parents }: { classes: AudienceClass[]; parents: AudienceParent[] }) {
  const { state, pending, formRef, onSubmit, errors: err } = useFormAction(createAnnouncement);
  const [category, setCategory] = useState<AnnouncementCategory>("general");
  const [audience, setAudience] = useState<AudienceChoice>("all");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const recipients = countRecipients(audience, classIds, parents);

  function pickCategory(c: AnnouncementCategory) {
    setCategory(c);
    // Chỉ điền mẫu khi chưa nhập gì / đang là mẫu khác
    const isTemplate = (text: string, key: "title" | "body") => !text || ANNOUNCEMENT_CATEGORY_KEYS.some((k) => TEMPLATES[k][key] === text);
    if (isTemplate(title, "title")) setTitle(TEMPLATES[c].title);
    if (isTemplate(body, "body")) setBody(TEMPLATES[c].body);
  }

  return (
    <form
      ref={formRef}
      onSubmit={async (e) => {
        // Giữ form trước khi chờ xác nhận (sau await, sự kiện không còn currentTarget)
        e.preventDefault();
        const form = e.currentTarget;
        if (recipients > 0 && !(await confirmSheet({ title: `Đăng thông báo tới ${recipients} phụ huynh?`, description: "Phụ huynh nhận thông báo trong app và trên điện thoại ngay.", confirmLabel: "Đăng & gửi" }))) return;
        onSubmit({ preventDefault() {}, currentTarget: form } as React.FormEvent<HTMLFormElement>);
      }}
      onReset={() => {
        setTitle("");
        setBody("");
        setCategory("general");
        setAudience("all");
        setClassIds([]);
      }}
      className="space-y-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border md:p-5"
    >
      <h2 className="flex items-center gap-2 font-bold">
        <Megaphone className="size-5 text-rose-600" /> Đăng thông báo mới
      </h2>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-muted-foreground">Loại thông báo</legend>
        <input type="hidden" name="category" value={category} />
        <div className="flex flex-wrap gap-1.5">
          {ANNOUNCEMENT_CATEGORY_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={category === k}
              onClick={() => pickCategory(k)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors",
                category === k ? "bg-slate-900 text-white ring-slate-900" : cn(ANNOUNCEMENT_CATEGORIES[k].badge, "hover:brightness-95"),
              )}
            >
              {ANNOUNCEMENT_CATEGORIES[k].label}
            </button>
          ))}
        </div>
      </fieldset>

      <Field label="Tiêu đề" htmlFor="an-title" error={err.title}>
        <input id="an-title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} required className={fieldClass} aria-invalid={!!err.title} />
      </Field>
      <Field label="Nội dung" htmlFor="an-body" error={err.body}>
        <Textarea id="an-body" name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={5000} required className="rounded-xl text-base md:text-sm" />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-muted-foreground">Gửi tới</legend>
        <input type="hidden" name="audience" value={audience} />
        <div role="radiogroup" aria-label="Gửi tới" className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCES.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={audience === a}
              onClick={() => setAudience(a)}
              className={cn(
                "flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ring-1 transition-colors",
                audience === a ? "bg-primary/10 text-primary ring-primary" : "bg-card ring-border hover:bg-muted",
              )}
            >
              {a === "CS1_XALA" || a === "CS2_NGOTHINHAM" ? (
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: CAMPUS_COLOR[a] }} aria-hidden />
              ) : (
                <Users className="size-4 shrink-0" />
              )}
              {AUDIENCE_LABEL[a]}
            </button>
          ))}
        </div>
        {audience === "classes" && (
          <div className="space-y-2 rounded-xl bg-muted/50 p-3">
            {CAMPUS_LIST.map((campus) => {
              const list = classes.filter((c) => c.campus === campus);
              if (list.length === 0) return null;
              const allOn = list.every((c) => classIds.includes(c.id));
              return (
                <div key={campus} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-xs font-bold">
                      <span className="size-2 rounded-full" style={{ background: CAMPUS_COLOR[campus] }} aria-hidden />
                      {CAMPUS_SHORT[campus]}
                    </p>
                    <button
                      type="button"
                      className="text-xs font-semibold text-primary"
                      onClick={() => setClassIds((prev) => (allOn ? prev.filter((id) => !list.some((c) => c.id === id)) : [...new Set([...prev, ...list.map((c) => c.id)])]))}
                    >
                      {allOn ? "Bỏ chọn" : "Chọn cả cơ sở"}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((c) => {
                      const on = classIds.includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className={cn(
                            "flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
                            on ? "bg-primary text-primary-foreground ring-primary" : "bg-card text-muted-foreground ring-border",
                          )}
                        >
                          <input
                            type="checkbox"
                            name="classIds"
                            value={c.id}
                            checked={on}
                            onChange={() => setClassIds((prev) => (on ? prev.filter((id) => id !== c.id) : [...prev, c.id]))}
                            className="sr-only"
                          />
                          {on && <Check className="size-3" />} Lớp {c.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {err.classIds && <p className="text-xs font-medium text-destructive">{err.classIds}</p>}
          </div>
        )}
        <p className={cn("text-xs", recipients ? "text-muted-foreground" : "font-medium text-amber-700")}>
          {recipients ? `Sẽ gửi tới khoảng ${recipients} phụ huynh (chuông thông báo trong ứng dụng).` : "Chưa có phụ huynh nào (đã liên kết tài khoản) thuộc nhóm này."}
        </p>
      </fieldset>

      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingText="Đang đăng..." className="w-full sm:w-auto">
        <Send /> Đăng & gửi thông báo
      </SubmitButton>
    </form>
  );
}

function AnnouncementItem({ item }: { item: AnnouncementRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const cat = ANNOUNCEMENT_CATEGORIES[item.category as AnnouncementCategory] ?? ANNOUNCEMENT_CATEGORIES.general;

  async function remove() {
    if (!(await confirmSheet({ title: `Xoá thông báo "${item.title}"?`, description: "Phụ huynh sẽ không còn thấy thông báo này.", confirmLabel: "Xoá thông báo", tone: "danger" }))) return;
    startTransition(async () => {
      const res = await deleteAnnouncement(item.id);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <li className={cn("space-y-2 p-4", pending && "opacity-60")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
            <span className={cn("rounded-full px-2 py-0.5 ring-1", cat.badge)}>{cat.label}</span>
            <span className="text-muted-foreground">
              {new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" }).format(new Date(item.createdAt))}
            </span>
          </div>
          <p className="font-bold">{item.title}</p>
          <p className="line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">{item.body}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="size-3.5" /> {item.audienceLabel} · <b className="text-foreground">{item.recipientCount}</b> phụ huynh đã nhận
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0 text-destructive" onClick={remove} disabled={pending} aria-label={`Xoá ${item.title}`}>
          {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
        </Button>
      </div>
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
    </li>
  );
}

export function AnnouncementManager({ items, classes, parents }: { items: AnnouncementRow[]; classes: AudienceClass[]; parents: AudienceParent[] }) {
  return (
    <div className="space-y-5">
      <AnnouncementForm classes={classes} parents={parents} />
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Đã đăng ({items.length})</h2>
        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">Chưa có thông báo nào.</p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
            {items.map((a) => (
              <AnnouncementItem key={a.id} item={a} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
