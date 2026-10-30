"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, Link2, Link2Off, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, fieldClass } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";
import { connectAutoDispatch, disconnectAutoDispatch, dispatchNow } from "../settings-actions";

export function AutoDispatchPanel({ connectedUrl, suggestedUrl, available }: { connectedUrl: string | null; suggestedUrl: string; available: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState(suggestedUrl);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: true; text: string } | { ok: false; text: string }>) => {
    setMessage(null);
    startTransition(async () => {
      setMessage(await fn());
      router.refresh();
    });
  };

  return (
    <section className="space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border md:p-5">
      <div>
        <h2 className="font-bold">Tự động đẩy mọi thông báo</h2>
        <p className="text-sm text-muted-foreground">
          Thao tác trong app (điểm danh, sổ liên lạc, đơn nghỉ…) đã tự đẩy ngay. Bật thêm mục này để cả thông báo sinh ngoài app (sửa trực tiếp trong
          database) cũng được đẩy — database tự gọi server qua pg_net, không cần tạo webhook bằng tay.
        </p>
      </div>
      {!available ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
          Chạy file <code>supabase/apply-push-autodispatch.sql</code> trong Supabase SQL Editor để bật tính năng này.
        </p>
      ) : connectedUrl ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
          <CircleCheck className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 break-all">
            Đã kết nối: <b>{connectedUrl}</b>
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg bg-white"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const res = await disconnectAutoDispatch();
                return res.ok ? { ok: true, text: "Đã ngắt kết nối tự động." } : { ok: false, text: res.error };
              })
            }
          >
            <Link2Off /> Ngắt
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Field label="Địa chỉ app đã triển khai (HTTPS)" htmlFor="ad-url" hint="Supabase phải gọi tới được địa chỉ này — không dùng localhost.">
            <input id="ad-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://app.thedu.vn" className={fieldClass} />
          </Field>
          <Button
            type="button"
            className="h-10 rounded-xl"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const res = await connectAutoDispatch(url);
                return res.ok ? { ok: true, text: `Đã kết nối: ${res.data.url}` } : { ok: false, text: res.error };
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Link2 />} Kết nối tự động
          </Button>
        </div>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-lg"
        disabled={pending}
        onClick={() =>
          run(async () => {
            const res = await dispatchNow();
            return res.ok
              ? { ok: true, text: `Đã gửi ${res.data.pushed} thông báo đẩy${res.data.outbound ? `, ${res.data.outbound} tin Zalo/SMS` : ""}.` }
              : { ok: false, text: res.error };
          })
        }
      >
        <Send /> Gửi ngay các thông báo đang chờ
      </Button>
      {message && (
        <p className={cn("flex items-start gap-2 text-sm font-medium", message.ok ? "text-emerald-700" : "text-destructive")}>
          {message.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
          {message.text}
        </p>
      )}
    </section>
  );
}
