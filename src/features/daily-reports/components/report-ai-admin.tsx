"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Eye, EyeOff, Loader2, Pencil, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { confirmSheet } from "@/components/ui/confirm-sheet";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { createNoteTemplate, deleteNoteTemplate, saveReportAiSettings, updateNoteTemplate } from "@/features/daily-reports/ai-admin-actions";
import { NAME_TOKEN, fillTemplate } from "@/features/daily-reports/note-favorites";
import type { NoteTemplate, ReportAiSettings } from "@/features/daily-reports/ai-settings";

function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left font-semibold ring-1 ring-border active:bg-muted disabled:opacity-50"
    >
      <span className="flex-1">
        {label}
        <span className="block text-xs font-normal text-muted-foreground">{hint}</span>
      </span>
      <span className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", checked ? "bg-primary" : "bg-muted-foreground/30")} aria-hidden>
        <span className={cn("absolute top-0.5 size-6 rounded-full bg-white shadow transition-[left]", checked ? "left-[1.375rem]" : "left-0.5")} />
      </span>
    </button>
  );
}

/** Ô soạn câu mẫu: có nút chèn {tên} vào đúng vị trí con trỏ + xem trước với tên ví dụ. */
function TemplateEditor({ initial, submitLabel, onSubmit, onCancel }: { initial: string; submitLabel: string; onSubmit: (text: string) => Promise<boolean>; onCancel?: () => void }) {
  const [text, setText] = useState(initial);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);
  const length = text.replace(/\s+/g, " ").trim().length;

  function insertName() {
    const el = ref.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = `${text.slice(0, start)}${NAME_TOKEN}${text.slice(end)}`;
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + NAME_TOKEN.length, start + NAME_TOKEN.length);
    });
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          if (await onSubmit(text)) setText(initial);
        });
      }}
    >
      <Textarea ref={ref} value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={700} placeholder={`VD: Hôm nay bé ${NAME_TOKEN} rất ngoan và hăng hái phát biểu, cô rất vui!`} className="rounded-xl" />
      {text.includes(NAME_TOKEN) && (
        <p className="rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
          Xem trước: <span className="text-foreground">{fillTemplate(text, "An")}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={insertName}>
          <Plus className="size-4" /> Chèn {NAME_TOKEN}
        </Button>
        <span className={cn("text-xs tabular-nums", length > 600 || (length > 0 && length < 10) ? "font-bold text-destructive" : "text-muted-foreground")}>{length}/600</span>
        <span className="flex-1" />
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" className="rounded-lg" onClick={onCancel} disabled={pending}>
            Huỷ
          </Button>
        )}
        <Button type="submit" size="sm" className="rounded-lg" disabled={pending || length < 10 || length > 600}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** Quản trị → Sổ liên lạc → Quản lý Trợ lý viết nhận xét. */
export function ReportAiAdmin({ settings, templates, aiConfigured }: { settings: ReportAiSettings; templates: NoteTemplate[]; aiConfigured: boolean }) {
  const router = useRouter();
  const [assistantEnabled, setAssistantEnabled] = useState(settings.assistantEnabled);
  const [aiEnabled, setAiEnabled] = useState(settings.aiEnabled);
  const [styleNote, setStyleNote] = useState(settings.styleNote);
  const [saving, startSaving] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const dirty = assistantEnabled !== settings.assistantEnabled || aiEnabled !== settings.aiEnabled || styleNote.trim() !== settings.styleNote;

  function saveSettings() {
    startSaving(async () => {
      const res = await saveReportAiSettings({ assistantEnabled, aiEnabled, styleNote });
      if (!res.ok) return toast.error("Chưa lưu được cài đặt", res.error);
      toast.success("Đã lưu cài đặt Trợ lý", "Áp dụng ngay cho mọi giáo viên.");
      router.refresh();
    });
  }

  async function run(id: string, action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setBusyId(id);
    try {
      const res = await action();
      if (!res.ok) {
        toast.error("Chưa thực hiện được", res.error);
        return false;
      }
      toast.success(success);
      router.refresh();
      return true;
    } finally {
      setBusyId(null);
    }
  }

  const activeCount = templates.filter((t) => t.active).length;

  return (
    <div className="space-y-5">
      {/* Cài đặt */}
      <section className="space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border" aria-labelledby="ai-settings-title">
        <h2 id="ai-settings-title" className="flex items-center gap-2 font-bold">
          <Bot className="size-4 text-primary" /> Cài đặt chung
        </h2>
        <Switch
          checked={assistantEnabled}
          onChange={setAssistantEnabled}
          label="Hiện Trợ lý viết nhận xét cho giáo viên"
          hint="Tắt → ẩn cả khung đánh giá nhanh, gợi ý và câu mẫu trong Sổ liên lạc"
        />
        <Switch
          checked={aiEnabled}
          onChange={setAiEnabled}
          disabled={!assistantEnabled}
          label="Dùng AI viết gợi ý"
          hint="Tắt → giáo viên chỉ nhận gợi ý soạn theo mẫu từ các đánh giá nhanh (không gọi AI, không tốn phí)"
        />
        {aiEnabled && !aiConfigured && (
          <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
            Máy chủ chưa có khoá AI (<code>ANTHROPIC_API_KEY</code>) — giáo viên đang nhận gợi ý theo mẫu. Thêm khoá vào biến môi trường (Vercel → Settings →
            Environment Variables) để bật AI.
          </p>
        )}
        <div className="space-y-1.5">
          <label htmlFor="style-note" className="text-sm font-semibold">
            Lưu ý văn phong của trung tâm <span className="font-normal text-muted-foreground">(không bắt buộc)</span>
          </label>
          <Textarea
            id="style-note"
            value={styleNote}
            onChange={(e) => setStyleNote(e.target.value)}
            rows={3}
            maxLength={500}
            disabled={!assistantEnabled || !aiEnabled}
            placeholder='VD: Luôn kết bằng "Cảm ơn Ba mẹ đã đồng hành cùng con". Gọi phụ huynh là "Ba mẹ".'
            className="rounded-xl"
          />
          <p className="text-xs text-muted-foreground">AI làm theo lưu ý này khi viết gợi ý (vẫn giữ các nguyên tắc: tích cực, khen trước nhắc sau, không bịa thông tin). {styleNote.length}/500</p>
        </div>
        <Button type="button" onClick={saveSettings} disabled={!dirty || saving} className="w-full rounded-xl sm:w-auto">
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Lưu cài đặt
        </Button>
      </section>

      {/* Câu mẫu chung */}
      <section className="space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border" aria-labelledby="ai-templates-title">
        <div>
          <h2 id="ai-templates-title" className="flex items-center gap-2 font-bold">
            <Sparkles className="size-4 text-primary" /> Câu mẫu của trung tâm
          </h2>
          <p className="text-xs text-muted-foreground">
            Hiện cho mọi giáo viên trong Trợ lý ({activeCount} câu đang bật). Dùng {NAME_TOKEN} ở chỗ cần tên bé — app tự điền tên bé đang viết.
          </p>
        </div>
        <TemplateEditor
          initial=""
          submitLabel="Thêm câu mẫu"
          onSubmit={(text) => run("new", () => createNoteTemplate(text), "Đã thêm câu mẫu")}
        />
        {templates.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Chưa có câu mẫu chung nào.</p>
        ) : (
          <ul className="space-y-2">
            {templates.map((t) => (
              <li key={t.id} className={cn("space-y-2 rounded-xl p-3 ring-1 ring-border", !t.active && "bg-muted/50")}>
                {editing === t.id ? (
                  <TemplateEditor
                    initial={t.content}
                    submitLabel="Lưu"
                    onCancel={() => setEditing(null)}
                    onSubmit={async (text) => {
                      const ok = await run(t.id, () => updateNoteTemplate({ id: t.id, content: text }), "Đã sửa câu mẫu");
                      if (ok) setEditing(null);
                      return ok;
                    }}
                  />
                ) : (
                  <>
                    <p className={cn("break-words text-sm", !t.active && "text-muted-foreground")}>
                      {!t.active && <span className="mr-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-bold">Đang ẩn</span>}
                      {t.content}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <Button type="button" size="sm" variant="outline" className="rounded-lg" disabled={busyId === t.id} onClick={() => setEditing(t.id)}>
                        <Pencil className="size-4" /> Sửa
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-lg"
                        disabled={busyId === t.id}
                        onClick={() => run(t.id, () => updateNoteTemplate({ id: t.id, active: !t.active }), t.active ? "Đã ẩn câu mẫu" : "Đã hiện lại câu mẫu")}
                      >
                        {t.active ? <EyeOff className="size-4" /> : <Eye className="size-4" />} {t.active ? "Ẩn" : "Hiện"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="rounded-lg text-rose-600 hover:text-rose-700"
                        disabled={busyId === t.id}
                        onClick={async () => {
                          const ok = await confirmSheet({ title: "Xoá câu mẫu này?", description: t.content, confirmLabel: "Xoá", tone: "danger" });
                          if (ok) await run(t.id, () => deleteNoteTemplate(t.id), "Đã xoá câu mẫu");
                        }}
                      >
                        {busyId === t.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Xoá
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
