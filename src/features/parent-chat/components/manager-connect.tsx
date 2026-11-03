"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CircleCheck, Headset, Loader2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ORGANIZATION } from "@/config/constants";
import { requestManagerHelp } from "../actions";
import type { ChatMessage } from "../schema";

/**
 * "Kết nối trực tiếp với Quản lý cơ sở": gửi câu hỏi (+ vài lượt trao đổi gần nhất) tới Ban quản lý qua kênh
 * Góp ý & hỗ trợ, đề nghị gọi lại → quản trị nhận thông báo ngay; trả lời hiện trong ứng dụng.
 */
export function ManagerConnect({ question, transcript, compact = false }: { question: string; transcript: ChatMessage[]; compact?: boolean }) {
  const [text, setText] = useState(question);
  const [editing, setEditing] = useState(!question);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const hotline = ORGANIZATION.phones[0];

  if (sent) {
    return (
      <div role="status" className="space-y-1.5 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
        <p className="flex items-center gap-1.5 font-bold">
          <CircleCheck className="size-4" /> Đã chuyển tới Quản lý cơ sở
        </p>
        <p>Trung tâm sẽ gọi lại hoặc trả lời Ba mẹ sớm nhất. Ba mẹ nhận thông báo khi có trả lời.</p>
        <Link href="/parent/feedback" className="inline-block font-semibold text-emerald-800 underline underline-offset-2">
          Xem ở mục Góp ý & hỗ trợ
        </Link>
      </div>
    );
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await requestManagerHelp({ question: text, transcript: transcript.slice(-6) });
        if (res.ok) setSent(true);
        else setError(res.error);
      } catch {
        setError("Không thể kết nối máy chủ. Vui lòng thử lại.");
      }
    });
  }

  return (
    <div className="space-y-2 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
      {!compact && <p className="text-sm font-semibold text-amber-950">Cần người của trung tâm hỗ trợ trực tiếp?</p>}
      {editing ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Ba mẹ cần Quản lý cơ sở hỗ trợ việc gì?"
          aria-label="Nội dung cần Quản lý cơ sở hỗ trợ"
          className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
        />
      ) : (
        <p className="rounded-xl bg-background/70 px-3 py-2 text-sm">
          “{text}”{" "}
          <button type="button" onClick={() => setEditing(true)} className="font-semibold text-primary underline underline-offset-2">
            Sửa
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="rounded-xl" onClick={submit} disabled={pending || text.trim().length < 2}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Headset className="size-4" />} Kết nối Quản lý cơ sở
        </Button>
        {hotline && (
          <Button type="button" size="sm" variant="outline" className="rounded-xl bg-background" asChild>
            <a href={`tel:${hotline.tel}`}>
              <Phone className="size-4" /> Gọi {hotline.display}
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
