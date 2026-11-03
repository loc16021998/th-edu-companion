"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Printer, Save, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { confirmSheet } from "@/components/ui/confirm-sheet";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { generateReport360, saveReport360, sendReport360 } from "../actions";

const MAX = 1900;

/** In bản nhận xét (họp phụ huynh): mở cửa sổ in chỉ chứa nội dung — không in giao diện ứng dụng. */
function printReport(title: string, content: string) {
  const w = window.open("", "_blank", "width=720,height=900");
  if (!w) return toast.error("Trình duyệt chặn cửa sổ in", "Cho phép cửa sổ bật lên rồi thử lại, hoặc dùng Sao chép.");
  const doc = w.document;
  doc.title = title;
  const style = doc.createElement("style");
  style.textContent = "body{font:15px/1.6 system-ui,sans-serif;margin:32px;color:#111}h1{font-size:20px;margin:0 0 4px}p.meta{color:#555;margin:0 0 20px}pre{white-space:pre-wrap;font:inherit}";
  doc.head.appendChild(style);
  const h1 = doc.createElement("h1");
  h1.textContent = title;
  const meta = doc.createElement("p");
  meta.className = "meta";
  meta.textContent = `TH EDU · ${new Date().toLocaleDateString("vi-VN")}`;
  const pre = doc.createElement("pre");
  pre.textContent = content; // textContent: không chèn HTML từ nội dung
  doc.body.append(h1, meta, pre);
  w.focus();
  w.print();
}

/** "Nhận xét chiều sâu 360°": soạn (AI / theo mẫu) → giáo viên sửa → lưu nháp, sao chép, in, gửi riêng phụ huynh qua Nhắn tin. */
export function Report360Sheet({
  open,
  onOpenChange,
  student,
  saved,
  canSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: { id: string; childName: string; fullName: string };
  saved?: { content: string; sentAt: string | null };
  /** Giáo viên: gửi qua Nhắn tin. Quản trị không phải người trong cuộc trò chuyện → sao chép / in. */
  canSend: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(saved?.content ?? "");
  const [notice, setNotice] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState(saved?.sentAt ?? null);
  const [generating, startGenerating] = useTransition();
  const [busy, startBusy] = useTransition();
  const dirty = text.trim() !== (saved?.content ?? "").trim();

  async function generate() {
    // Soạn lại đè lên bản đang có → hỏi trước nếu cô đã sửa mà chưa lưu
    if (dirty && text.trim()) {
      const ok = await confirmSheet({ title: "Soạn lại bản mới?", description: "Phần cô vừa sửa (chưa lưu) sẽ bị thay bằng bản soạn mới.", confirmLabel: "Soạn lại", tone: "danger" });
      if (!ok) return;
    }
    startGenerating(async () => {
      try {
        const res = await generateReport360(student.id);
        if (!res.ok) return toast.error("Chưa soạn được nhận xét", res.error);
        setText(res.data.content);
        setNotice(res.data.notice);
        setSentAt(null);
        router.refresh();
      } catch {
        toast.error("Không thể kết nối máy chủ", "Kiểm tra mạng rồi thử lại.");
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !generating && !busy && onOpenChange(o)}>
      <SheetContent fixed className="h-[92dvh] sm:h-[88dvh]">
        <SheetHeader className="shrink-0">
          <SheetTitle>Nhận xét chiều sâu 360° — bé {student.childName}</SheetTitle>
          <SheetDescription>Tổng hợp 30 ngày: điểm mạnh, điều cần cải thiện, chuyên cần & bài tập, gợi ý Ba mẹ đồng hành tại nhà. Cô sửa tuỳ ý trước khi gửi.</SheetDescription>
        </SheetHeader>
        <div className="-mx-4 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-4 sm:-mx-6 sm:px-6">
          <Button type="button" onClick={() => void generate()} disabled={generating || busy} className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-sky-600 text-white hover:from-violet-700 hover:to-sky-700">
            {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {generating ? "Đang tổng hợp nhận xét..." : text ? "Soạn lại bản mới" : "Soạn nhận xét 360°"}
          </Button>
          {notice && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">{notice}</p>}
          {sentAt && !dirty && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900 ring-1 ring-emerald-200">Đã gửi phụ huynh lúc {new Date(sentAt).toLocaleString("vi-VN")}.</p>
          )}
          {generating && !text ? (
            <div className="space-y-2 rounded-xl bg-muted/50 p-3" aria-live="polite">
              <span className="sr-only">Đang tổng hợp nhận xét...</span>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-3 animate-pulse rounded bg-muted" style={{ width: `${90 - i * 12}%` }} />
              ))}
            </div>
          ) : text ? (
            <div className="space-y-1">
              <label htmlFor="report360" className="sr-only">
                Nội dung nhận xét 360°
              </label>
              {/* Đang soạn bản mới → khoá ô nhập, tránh phần cô gõ bị bản mới đè mất */}
              <Textarea
                id="report360"
                value={text}
                onChange={(e) => setText(e.target.value)}
                readOnly={generating}
                aria-busy={generating}
                rows={16}
                maxLength={MAX}
                className={cn("rounded-xl text-base leading-relaxed md:text-sm", generating && "opacity-60")}
              />
              <p className={text.length >= MAX ? "text-xs font-bold text-amber-700" : "text-xs text-muted-foreground"}>
                {text.length}/{MAX} ký tự (vừa 1 tin nhắn)
              </p>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Bấm “Soạn nhận xét 360°” để tổng hợp từ điểm danh, sổ liên lạc và bài tập 30 ngày qua.</p>
          )}

          {text && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                disabled={busy || generating || !dirty}
                onClick={() =>
                  startBusy(async () => {
                    const res = await saveReport360(student.id, text);
                    if (!res.ok) return toast.error("Chưa lưu được", res.error);
                    toast.success("Đã lưu bản nháp");
                    router.refresh();
                  })
                }
              >
                <Save /> Lưu nháp
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => void navigator.clipboard?.writeText(text).then(() => toast.success("Đã sao chép nhận xét"), () => toast.error("Không sao chép được"))}
              >
                <Copy /> Sao chép
              </Button>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => printReport(`Nhận xét chiều sâu 360° — ${student.fullName}`, text)}>
                <Printer /> In
              </Button>
              {canSend && (
                <Button
                  type="button"
                  className="rounded-xl"
                  disabled={busy || generating || text.trim().length < 20}
                  onClick={async () => {
                    const ok = await confirmSheet({
                      title: "Gửi riêng cho phụ huynh?",
                      description: `Bản nhận xét được gửi vào Nhắn tin với phụ huynh của bé ${student.childName}; phụ huynh nhận thông báo ngay.`,
                      confirmLabel: "Gửi",
                    });
                    if (!ok) return;
                    startBusy(async () => {
                      const res = await sendReport360(student.id, text);
                      if (!res.ok) return toast.error("Chưa gửi được", res.error);
                      setSentAt(new Date().toISOString());
                      toast.success("Đã gửi cho phụ huynh", "Xem trong mục Nhắn tin.");
                      router.refresh();
                    });
                  }}
                >
                  {busy ? <Loader2 className="animate-spin" /> : <Send />} Gửi phụ huynh
                </Button>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
