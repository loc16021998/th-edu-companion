import type { Metadata } from "next";
import { headers } from "next/headers";
import { CircleCheck, CircleDashed, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { outboundConfig } from "@/lib/messaging/outbound";
import { pushConfigured } from "@/lib/push/server";
import { PushOptIn } from "@/features/push/components/push-opt-in";
import { AutoDispatchPanel } from "@/features/push/components/autodispatch-panel";

export const metadata: Metadata = { title: "Cài đặt thông báo" };

function Check({ ok, label, hint, icon: Icon = ok ? CircleCheck : CircleDashed }: { ok: boolean; label: string; hint: string; icon?: LucideIcon }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Icon className={cn("mt-0.5 size-5 shrink-0", ok ? "text-emerald-600" : "text-amber-500")} />
      <div className="min-w-0">
        <p className="font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <span className={cn("ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-bold", ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")}>
        {ok ? "Sẵn sàng" : "Chưa cấu hình"}
      </span>
    </li>
  );
}

export default async function NotificationSettingsPage() {
  const supabase = await createClient();
  const settingsRes = await supabase.from("app_settings").select("key, value").eq("key", "push_dispatch_url").maybeSingle();
  const available = !settingsRes.error;

  let devices: number | null = null;
  let pendingCount: number | null = null;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createAdminClient();
    const [devRes, pendingRes] = await Promise.all([
      admin.from("push_subscriptions").select("id", { count: "exact", head: true }),
      admin.from("notifications").select("id", { count: "exact", head: true }).is("pushed_at", null).gte("created_at", new Date(Date.now() - 3600_000).toISOString()),
    ]);
    devices = devRes.error ? null : (devRes.count ?? 0);
    pendingCount = pendingRes.error ? null : (pendingRes.count ?? 0);
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const out = outboundConfig();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold">Cài đặt thông báo</h1>
        <p className="text-sm text-muted-foreground">Thông báo đẩy lên điện thoại (Web Push) và kết nối Zalo ZNS / SMS.</p>
      </div>

      <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border md:p-5">
        <h2 className="font-bold">Trạng thái</h2>
        <ul className="divide-y">
          <Check ok={pushConfigured()} label="Web Push (VAPID)" hint="NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT + SUPABASE_SERVICE_ROLE_KEY" />
          <Check
            ok={Boolean(process.env.PUSH_DISPATCH_SECRET && process.env.PUSH_DISPATCH_SECRET.length >= 32)}
            label="Mã bí mật /api/push/dispatch"
            hint="PUSH_DISPATCH_SECRET (≥ 32 ký tự) — dùng cho kết nối tự động / cron"
          />
          <Check
            ok={out.enabled}
            label="Zalo ZNS / SMS (webhook)"
            hint={out.enabled ? `Kênh: ${out.channels.join(", ")} · sự kiện: ${[...out.events].join(", ") || "chưa chọn"}` : "MESSAGING_WEBHOOK_URL + MESSAGING_WEBHOOK_SECRET (tuỳ chọn)"}
          />
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          {devices !== null && <>Thiết bị đã bật thông báo: <b className="text-foreground">{devices}</b>. </>}
          {pendingCount !== null && <>Thông báo chờ gửi (1 giờ qua): <b className="text-foreground">{pendingCount}</b>.</>}
        </p>
      </section>

      <AutoDispatchPanel connectedUrl={settingsRes.data?.value ?? null} suggestedUrl={host ? `${proto}://${host}` : ""} available={available} />

      <PushOptIn />
    </div>
  );
}
