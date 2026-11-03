"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Loader2, Pencil, RotateCcw, Sparkles, Star, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { SUBJECTS, type SubjectKey } from "@/config/constants";
import { cn } from "@/lib/utils";
import { generateAIReportNote, type AiNoteResult } from "@/features/daily-reports/ai-report";
import {
  ATTITUDE_TAGS,
  EMPTY_SELECTION,
  MOOD_TAGS,
  SUBJECT_TAGS,
  selectionCount,
  type AiNoteSelection,
  type AiTag,
} from "@/features/daily-reports/ai-tags";
import { NAME_TOKEN, addFavorite, fillTemplate, readFavorites, removeFavorite, toTemplate } from "@/features/daily-reports/note-favorites";

function TagGroup({ label, tags, isOn, onToggle }: { label: string; tags: readonly AiTag[]; isOn: (id: string) => boolean; onToggle: (id: string) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {tags.map((t) => {
          const on = isOn(t.id);
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(t.id)}
              className={cn(
                "flex min-h-9 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors active:scale-95",
                on ? "bg-violet-600 text-white ring-violet-600" : "bg-background text-foreground ring-border hover:bg-muted",
              )}
            >
              {on && <Check className="size-3.5" aria-hidden />}
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/**
 * Trợ lý viết "Nhận xét chung" của Sổ liên lạc:
 *  1. Chạm chọn nhanh tâm trạng, thái độ, từng môn.
 *  2. "✨ Dùng AI gợi ý nhận xét" → 2–3 phương án; "Dùng câu này" chèn vào ô nhận xét để sửa tiếp (có hoàn tác).
 *  3. "Câu mẫu của tôi": lưu trên máy, dùng được cả khi mất mạng.
 */
export function AiNoteAssistant({
  studentId,
  childName,
  note,
  onSetNote,
  aiEnabled = true,
  centerTemplates = [],
}: {
  studentId: string;
  /** Quản trị tắt AI → nút thành "Gợi ý theo mẫu" (vẫn dùng các đánh giá nhanh) */
  aiEnabled?: boolean;
  /** Câu mẫu chung do quản trị soạn ({tên} = tên gọi của bé) */
  centerTemplates?: string[];
  /** Tên gọi của bé (vd. "An") */
  childName: string;
  /** Nội dung ô nhận xét hiện tại */
  note: string;
  onSetNote: (text: string) => void;
}) {
  const online = useOnline();
  const [selection, setSelection] = useState<AiNoteSelection>(EMPTY_SELECTION);
  const [result, setResult] = useState<AiNoteResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [undo, setUndo] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [editingFavorites, setEditingFavorites] = useState(false);
  useEffect(() => setFavorites(readFavorites()), []);

  const count = selectionCount(selection);
  const toggleList = <T extends string>(list: T[], id: T) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  function generate() {
    startTransition(async () => {
      setResult(null);
      try {
        const res = await generateAIReportNote({ studentId, ...selection });
        if (!res.ok) {
          toast.error("Chưa gợi ý được nhận xét", res.error);
          return;
        }
        setResult(res.data);
      } catch {
        toast.error("Không thể kết nối máy chủ", "Kiểm tra mạng rồi thử lại, hoặc dùng Câu mẫu của tôi.");
      }
    });
  }

  function applyText(text: string) {
    setUndo(note);
    onSetNote(text);
    // Ô nhận xét nằm ngay dưới → đưa con trỏ vào để sửa tiếp
    const field = document.querySelector<HTMLTextAreaElement>('textarea[name="teacherNote"]');
    field?.focus({ preventScroll: true });
    field?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const currentTemplate = note.trim() ? toTemplate(note, childName) : "";
  const alreadySaved = currentTemplate !== "" && favorites.includes(currentTemplate);

  function saveFavorite(text: string) {
    const template = toTemplate(text, childName);
    setFavorites((list) => addFavorite(list, template));
    toast.success("Đã lưu vào Câu mẫu của tôi", template.includes(NAME_TOKEN) ? `Tên bé được thay bằng ${NAME_TOKEN} để dùng cho cả lớp.` : undefined);
  }

  return (
    <div className="space-y-3 rounded-2xl bg-gradient-to-br from-violet-50 to-sky-50 p-3 ring-1 ring-violet-200 dark:from-violet-950/40 dark:to-sky-950/30 dark:ring-violet-900">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 font-bold text-violet-800 dark:text-violet-200">
            <Sparkles className="size-4" aria-hidden /> Trợ lý viết nhận xét
          </p>
          <p className="text-xs text-muted-foreground">Chạm chọn nhanh → AI gợi ý vài câu, bạn chọn rồi sửa tuỳ ý.</p>
        </div>
        {count > 0 && (
          <button type="button" onClick={() => setSelection(EMPTY_SELECTION)} className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-background">
            Bỏ chọn ({count})
          </button>
        )}
      </div>

      <TagGroup
        label="Tâm trạng"
        tags={MOOD_TAGS}
        isOn={(id) => selection.mood === id}
        onToggle={(id) => setSelection((s) => ({ ...s, mood: s.mood === id ? null : (id as AiNoteSelection["mood"]) }))}
      />
      <TagGroup
        label="Thái độ học tập"
        tags={ATTITUDE_TAGS}
        isOn={(id) => selection.attitude.includes(id as AiNoteSelection["attitude"][number])}
        onToggle={(id) => setSelection((s) => ({ ...s, attitude: toggleList(s.attitude, id as AiNoteSelection["attitude"][number]) }))}
      />
      {(Object.keys(SUBJECT_TAGS) as SubjectKey[]).map((key) => (
        <TagGroup
          key={key}
          label={SUBJECTS[key]}
          tags={SUBJECT_TAGS[key]}
          isOn={(id) => (selection.subjects[key] as string[]).includes(id)}
          onToggle={(id) =>
            setSelection((s) => ({ ...s, subjects: { ...s.subjects, [key]: toggleList(s.subjects[key] as string[], id) } }) as AiNoteSelection)
          }
        />
      ))}

      <Button
        type="button"
        onClick={generate}
        disabled={pending || count === 0 || !online}
        className="h-11 w-full rounded-xl bg-gradient-to-r from-violet-600 to-sky-600 text-base font-bold text-white shadow-md hover:from-violet-700 hover:to-sky-700"
      >
        {pending && <Loader2 className="animate-spin" />}
        {pending
          ? aiEnabled
            ? "AI đang viết nhận xét..."
            : "Đang soạn gợi ý..."
          : result
            ? "✨ Gợi ý câu khác"
            : aiEnabled
              ? "✨ Dùng AI gợi ý nhận xét"
              : "✨ Gợi ý nhận xét theo mẫu"}
      </Button>
      {!online ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
          <WifiOff className="size-3.5" aria-hidden /> Đang mất mạng — dùng Câu mẫu của tôi bên dưới.
        </p>
      ) : (
        count === 0 && <p className="text-xs text-muted-foreground">Chọn ít nhất 1 đánh giá để AI có thông tin viết nhận xét.</p>
      )}

      <div aria-live="polite" className="space-y-2">
        {pending && (
          <div className="space-y-2 rounded-xl bg-background/80 p-3">
            <span className="sr-only">AI đang viết nhận xét...</span>
            {[0, 1].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-3 w-full animate-pulse rounded bg-muted" />
                <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        )}
        {!pending && result && (
          <>
            {result.notice && <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 ring-1 ring-amber-200">{result.notice}</p>}
            {result.options.map((text, i) => (
              <div key={i} className="space-y-2 rounded-xl bg-background p-3 ring-1 ring-border">
                <p className="text-sm leading-relaxed">{text}</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" className="rounded-lg" onClick={() => applyText(text)}>
                    <Check className="size-4" /> Dùng câu này
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="rounded-lg" onClick={() => saveFavorite(text)}>
                    <Star className="size-4" /> Lưu làm câu mẫu
                  </Button>
                </div>
              </div>
            ))}
          </>
        )}
        {undo !== null && (
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            Đã chèn vào ô nhận xét bên dưới — sửa tuỳ ý trước khi lưu.
            <button
              type="button"
              onClick={() => {
                onSetNote(undo);
                setUndo(null);
              }}
              className="flex items-center gap-1 font-semibold text-primary"
            >
              <RotateCcw className="size-3.5" aria-hidden /> Hoàn tác
            </button>
          </p>
        )}
      </div>

      {/* Câu mẫu chung của trung tâm (quản trị soạn) */}
      {centerTemplates.length > 0 && (
        <div className="space-y-1.5 border-t border-violet-200/70 pt-3 dark:border-violet-900">
          <p className="text-xs font-bold text-muted-foreground">Câu mẫu của trung tâm</p>
          <ul className="flex flex-col gap-1.5">
            {centerTemplates.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  onClick={() => applyText(fillTemplate(t, childName))}
                  title="Chạm để dùng câu mẫu của trung tâm"
                  className="line-clamp-2 w-full rounded-xl bg-background px-3 py-2 text-left text-sm ring-1 ring-border hover:bg-muted"
                >
                  {fillTemplate(t, childName)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Câu mẫu của tôi — lưu trên máy, dùng được khi mất mạng */}
      <div className="space-y-1.5 border-t border-violet-200/70 pt-3 dark:border-violet-900">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-muted-foreground">Câu mẫu của tôi {favorites.length > 0 && `(${favorites.length})`}</p>
          {favorites.length > 0 && (
            <button type="button" onClick={() => setEditingFavorites((v) => !v)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-background">
              <Pencil className="size-3" aria-hidden /> {editingFavorites ? "Xong" : "Sửa"}
            </button>
          )}
        </div>
        {favorites.length === 0 ? (
          <p className="text-xs text-muted-foreground">Chưa có câu mẫu. Bấm &quot;Lưu làm câu mẫu&quot; ở gợi ý AI, hoặc lưu nhận xét đang viết.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {favorites.map((t) => (
              <li key={t} className="flex items-stretch gap-1.5">
                <button
                  type="button"
                  disabled={editingFavorites}
                  onClick={() => applyText(fillTemplate(t, childName))}
                  title="Chạm để dùng câu này"
                  className="line-clamp-2 min-w-0 flex-1 rounded-xl bg-background px-3 py-2 text-left text-sm ring-1 ring-border hover:bg-muted disabled:opacity-70"
                >
                  {fillTemplate(t, childName)}
                </button>
                {editingFavorites && (
                  <button
                    type="button"
                    onClick={() => setFavorites((list) => removeFavorite(list, t))}
                    aria-label="Xoá câu mẫu này"
                    className="flex w-10 shrink-0 items-center justify-center rounded-xl bg-background text-rose-600 ring-1 ring-border hover:bg-rose-50"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {currentTemplate && !alreadySaved && (
          <button type="button" onClick={() => saveFavorite(note)} className="flex items-center gap-1 rounded-lg py-1 text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300">
            <Star className="size-3.5" aria-hidden /> Lưu nhận xét đang viết làm câu mẫu
          </button>
        )}
      </div>
    </div>
  );
}
