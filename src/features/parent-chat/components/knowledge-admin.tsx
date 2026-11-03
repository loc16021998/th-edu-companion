"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Eye, EyeOff, FilePlus2, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { confirmSheet } from "@/components/ui/confirm-sheet";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { addDraftArticles, createArticle, deleteArticle, updateArticle } from "../knowledge-actions";
import { KNOWLEDGE_CATEGORIES, KNOWLEDGE_CATEGORY_KEYS, type KnowledgeCategory } from "../knowledge-shared";
import type { KnowledgeRow } from "../knowledge";

type Draft = { id: string | null; title: string; category: KnowledgeCategory; content: string; active: boolean };

/** Bài còn chỗ "[cần điền]" của bản nháp */
const hasPlaceholder = (text: string) => /\[[^\]\n]{2,80}\]/.test(text);
const categoryLabel = (c: string) => KNOWLEDGE_CATEGORIES[c as KnowledgeCategory] ?? KNOWLEDGE_CATEGORIES.khac;

/** Quản trị → Kho kiến thức Trợ lý AI: tài liệu chính thức trợ lý dùng để trả lời phụ huynh. */
export function KnowledgeAdmin({ items }: { items: KnowledgeRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<KnowledgeCategory | "all">("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [addingDrafts, startAddingDrafts] = useTransition();

  const shown = filter === "all" ? items : items.filter((a) => a.category === filter);
  const activeCount = items.filter((a) => a.active).length;

  async function run(id: string, action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setBusyId(id);
    try {
      const res = await action();
      if (!res.ok) return toast.error("Chưa thực hiện được", res.error);
      toast.success(success);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  function save() {
    if (!draft) return;
    startSaving(async () => {
      const { id, ...fields } = draft;
      const res = id ? await updateArticle({ id, ...fields }) : await createArticle(fields);
      if (!res.ok) return toast.error("Chưa lưu được bài viết", res.error);
      toast.success(id ? "Đã cập nhật bài viết" : "Đã thêm bài viết", fields.active ? "Trợ lý dùng bài này ngay cho câu hỏi tiếp theo." : "Bài đang tắt — bật khi đã duyệt xong.");
      setDraft(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" className="rounded-xl" onClick={() => setDraft({ id: null, title: "", category: "quy_che", content: "", active: true })}>
          <Plus /> Thêm bài viết
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-xl"
          disabled={addingDrafts}
          onClick={() =>
            startAddingDrafts(async () => {
              const res = await addDraftArticles();
              if (!res.ok) return toast.error("Chưa thêm được", res.error);
              if (res.data.added === 0) return toast.success("Bộ bài mẫu đã có sẵn trong kho");
              toast.success(`Đã thêm ${res.data.added} bài nháp (đang tắt)`, "Sửa phần [trong ngoặc vuông] cho đúng quy định của trung tâm rồi bật lên.");
              router.refresh();
            })
          }
        >
          {addingDrafts ? <Loader2 className="animate-spin" /> : <FilePlus2 />} Thêm bộ bài mẫu (bản nháp)
        </Button>
        <span className="text-sm text-muted-foreground">
          {activeCount}/{items.length} bài đang bật
        </span>
      </div>

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Lọc theo chủ đề">
        {(["all", ...KNOWLEDGE_CATEGORY_KEYS] as const).map((c) => {
          const count = c === "all" ? items.length : items.filter((a) => a.category === c).length;
          return (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={filter === c}
              onClick={() => setFilter(c)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition-colors",
                filter === c ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border hover:bg-muted",
              )}
            >
              {c === "all" ? "Tất cả" : KNOWLEDGE_CATEGORIES[c]} ({count})
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          {items.length === 0 ? 'Kho chưa có bài nào. Bấm "Thêm bộ bài mẫu" để có sẵn bản nháp, hoặc "Thêm bài viết".' : "Không có bài nào trong chủ đề này."}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((a) => (
            <li key={a.id} className={cn("space-y-2 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border", !a.active && "bg-muted/40")}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{categoryLabel(a.category)}</span>
                {a.active ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">Đang bật</span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">Đang tắt</span>
                )}
                {hasPlaceholder(a.content) && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                    <CircleAlert className="size-3" /> Còn chỗ [cần điền]
                  </span>
                )}
              </div>
              <h3 className="break-words font-bold">{a.title}</h3>
              <p className={cn("whitespace-pre-wrap break-words text-sm text-muted-foreground", expanded !== a.id && "line-clamp-3")}>{a.content}</p>
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" size="sm" variant="ghost" className="rounded-lg" onClick={() => setExpanded(expanded === a.id ? null : a.id)}>
                  {expanded === a.id ? "Thu gọn" : "Xem đủ"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  disabled={busyId === a.id}
                  onClick={() => setDraft({ id: a.id, title: a.title, category: a.category as KnowledgeCategory, content: a.content, active: a.active })}
                >
                  <Pencil className="size-4" /> Sửa
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  disabled={busyId === a.id}
                  onClick={() => run(a.id, () => updateArticle({ id: a.id, active: !a.active }), a.active ? "Đã tắt bài viết" : "Đã bật bài viết")}
                >
                  {a.active ? <EyeOff className="size-4" /> : <Eye className="size-4" />} {a.active ? "Tắt" : "Bật"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="rounded-lg text-rose-600 hover:text-rose-700"
                  disabled={busyId === a.id}
                  onClick={async () => {
                    if (await confirmSheet({ title: "Xoá bài viết này?", description: a.title, confirmLabel: "Xoá", tone: "danger" }))
                      await run(a.id, () => deleteArticle(a.id), "Đã xoá bài viết");
                  }}
                >
                  {busyId === a.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Xoá
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={!!draft} onOpenChange={(o) => !o && !saving && setDraft(null)}>
        <SheetContent fixed className="h-[92dvh] sm:h-[85dvh]">
          <SheetHeader className="shrink-0">
            <SheetTitle>{draft?.id ? "Sửa bài viết" : "Thêm bài viết"}</SheetTitle>
            <SheetDescription>Trợ lý AI dùng nội dung này để trả lời phụ huynh — viết rõ ràng, đúng quy định thật của trung tâm.</SheetDescription>
          </SheetHeader>
          {draft && (
            <form
              className="-mx-4 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-4 sm:-mx-6 sm:px-6"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <div className="space-y-1.5">
                <label htmlFor="kb-title" className="text-sm font-semibold">
                  Tiêu đề
                </label>
                <Input id="kb-title" value={draft.title} maxLength={150} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="VD: Nghỉ học và học bù" />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">Chủ đề</p>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Chủ đề">
                  {KNOWLEDGE_CATEGORY_KEYS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={draft.category === c}
                      onClick={() => setDraft({ ...draft, category: c })}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-sm font-medium ring-1",
                        draft.category === c ? "bg-primary text-primary-foreground ring-primary" : "bg-background ring-border hover:bg-muted",
                      )}
                    >
                      {KNOWLEDGE_CATEGORIES[c]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="kb-content" className="text-sm font-semibold">
                  Nội dung
                </label>
                <Textarea
                  id="kb-content"
                  value={draft.content}
                  maxLength={8000}
                  rows={12}
                  onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                  placeholder={"VD:\n- Bé nghỉ có phép được học bù trong vòng 2 tuần.\n- Lịch bù do giáo viên chủ nhiệm sắp xếp…"}
                  className="rounded-xl"
                />
                <p className="text-xs text-muted-foreground">{draft.content.length}/8000 ký tự. Gạch đầu dòng &quot;- &quot; giúp trợ lý trích đúng ý.</p>
                {draft.active && hasPlaceholder(draft.content) && (
                  <p className="flex gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-900 ring-1 ring-amber-200">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" /> Nội dung còn chỗ [trong ngoặc vuông] chưa điền — trợ lý có thể trả lời phụ huynh theo đúng chữ đó.
                  </p>
                )}
              </div>
              <label className="flex items-center gap-3 rounded-xl p-3 ring-1 ring-border">
                <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} className="size-5 accent-[hsl(var(--primary))]" />
                <span className="text-sm">
                  <span className="font-semibold">Bật cho trợ lý dùng</span>
                  <span className="block text-xs text-muted-foreground">Tắt = lưu nháp, trợ lý chưa dùng.</span>
                </span>
              </label>
              <Button type="submit" className="w-full rounded-xl" disabled={saving || draft.title.trim().length < 3 || draft.content.trim().length < 10}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />} Lưu bài viết
              </Button>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
