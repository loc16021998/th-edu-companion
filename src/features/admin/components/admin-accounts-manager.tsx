"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert, ShieldCheck, ShieldPlus, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { Field, FormMessage, SubmitButton, fieldClass, useFormAction } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";
import { createAdminAccountAction, removeAdminAccountAction } from "../admin-account-actions";
import type { AdminRow } from "../accounts";
import { displayPhone, randomPassword } from "./account-manager";

/** Mật khẩu quản trị ngẫu nhiên: 14 ký tự, chắc chắn có cả chữ và số. */
function strongPassword() {
  for (;;) {
    const p = randomPassword(14);
    if (/[A-Za-z]/.test(p) && /\d/.test(p)) return p;
  }
}

function CreateAdminForm() {
  const { state, pending, formRef, onSubmit, errors: err } = useFormAction(createAdminAccountAction);
  const [password, setPassword] = useState("");
  const [created, setCreated] = useState<{ name: string; login: string; password: string } | null>(null);
  const text = created ? `Tài khoản QUẢN TRỊ TH EDU Companion\nHọ tên: ${created.name}\nĐăng nhập: ${created.login}\nMật khẩu: ${created.password}\nĐăng nhập tại trang Quản trị (/admin/login) và đổi mật khẩu ngay lần đầu.` : "";

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        const fd = new FormData(e.currentTarget);
        const phone = String(fd.get("phone") ?? "").trim();
        const email = String(fd.get("email") ?? "").trim();
        setCreated({ name: String(fd.get("fullName") ?? "").trim(), login: phone || email, password });
        onSubmit(e);
      }}
      onReset={() => setPassword("")}
      className="space-y-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border md:p-5"
    >
      <h2 className="flex items-center gap-2 font-bold">
        <ShieldPlus className="size-5 text-primary" /> Tạo tài khoản quản trị
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Họ tên" htmlFor="ad-name" error={err.fullName} className="sm:col-span-2">
          <input id="ad-name" name="fullName" className={fieldClass} required maxLength={100} autoComplete="off" />
        </Field>
        <Field label="Số điện thoại (dùng để đăng nhập)" htmlFor="ad-phone" error={err.phone}>
          <input id="ad-phone" name="phone" type="tel" inputMode="tel" className={fieldClass} placeholder="0912 345 678" autoComplete="off" />
        </Field>
        <Field label="Email (dùng để đăng nhập)" htmlFor="ad-email" error={err.email}>
          <input id="ad-email" name="email" type="email" className={fieldClass} placeholder="ten@email.com" autoComplete="off" />
        </Field>
        <Field label="Mật khẩu cho quản trị viên mới" htmlFor="ad-password" error={err.password} hint="Tối thiểu 10 ký tự, có cả chữ và số." className="sm:col-span-2">
          <div className="flex gap-2">
            <input
              id="ad-password"
              name="password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={cn(fieldClass, "font-mono")}
              minLength={10}
              required
              autoComplete="new-password"
            />
            <Button type="button" variant="outline" className="h-11 shrink-0 rounded-xl" onClick={() => setPassword(strongPassword())}>
              <Wand2 /> Tạo ngẫu nhiên
            </Button>
          </div>
        </Field>
      </div>

      <div className="space-y-2 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:ring-amber-900">
        <Field label="Mật khẩu CỦA BẠN để xác nhận" htmlFor="ad-confirm" error={err.currentPassword} hint="Bắt buộc với mọi thao tác cấp / thu hồi quyền quản trị.">
          <input id="ad-confirm" name="currentPassword" type="password" className={fieldClass} required autoComplete="current-password" />
        </Field>
      </div>

      <FormMessage state={state} />
      {state.ok && created && (
        <div className="space-y-2 rounded-xl bg-muted p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground">Gửi riêng thông tin đăng nhập cho quản trị viên mới (không gửi qua nhóm chung):</p>
            <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={() => void navigator.clipboard?.writeText(text).then(() => toast.success("Đã sao chép"))}>
              Sao chép
            </Button>
          </div>
          <pre className="whitespace-pre-wrap break-all font-mono text-xs">{text}</pre>
        </div>
      )}
      <SubmitButton pending={pending} pendingText="Đang tạo..." className="w-full sm:w-auto">
        <ShieldPlus /> Tạo tài khoản quản trị
      </SubmitButton>
    </form>
  );
}

function RemoveAdminSheet({ target, onClose }: { target: AdminRow; onClose: () => void }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Sheet open onOpenChange={(o) => !o && !pending && onClose()}>
      <SheetContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const res = await removeAdminAccountAction({ userId: target.id, currentPassword: password });
              if (!res.ok) return setError(res.error);
              toast.success(`Đã thu hồi tài khoản quản trị của ${target.full_name}`);
              onClose();
              router.refresh();
            });
          }}
        >
          <SheetHeader>
            <SheetTitle>Thu hồi quyền quản trị?</SheetTitle>
            <SheetDescription>
              Tài khoản <b>{target.full_name}</b> sẽ bị xoá và không đăng nhập được nữa. Thao tác được ghi vào Nhật ký & bảo mật.
            </SheetDescription>
          </SheetHeader>
          <Field label="Mật khẩu CỦA BẠN để xác nhận" htmlFor="rm-confirm" error={error ?? undefined}>
            <input id="rm-confirm" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={fieldClass} required autoComplete="current-password" />
          </Field>
          <Button type="submit" variant="destructive" className="h-11 w-full rounded-xl" disabled={pending || !password}>
            {pending ? <Loader2 className="animate-spin" /> : <Trash2 />} Thu hồi tài khoản
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** Trang Quản trị → Tài khoản quản trị: tạo / thu hồi quản trị viên (chỉ quản trị mới vào được). */
export function AdminAccountsManager({ admins, meId, canManage }: { admins: AdminRow[]; meId: string; canManage: boolean }) {
  const [removing, setRemoving] = useState<AdminRow | null>(null);

  return (
    <div className="space-y-5">
      <p className="flex gap-2 rounded-2xl bg-rose-50 p-4 text-sm text-rose-900 ring-1 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-100 dark:ring-rose-900">
        <ShieldAlert className="mt-0.5 size-5 shrink-0" />
        <span>
          Quản trị viên có <b>toàn quyền</b>: xem mọi dữ liệu học sinh, cấp tài khoản, học phí, lương, tạo thêm quản trị viên… Chỉ cấp cho người thật sự phụ trách vận hành trung
          tâm, và nhắc họ đổi mật khẩu ngay lần đầu đăng nhập.
        </span>
      </p>

      {canManage ? (
        <CreateAdminForm />
      ) : (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Chưa cấu hình <code>SUPABASE_SERVICE_ROLE_KEY</code> trên máy chủ nên chưa tạo được tài khoản quản trị.
        </p>
      )}

      <section className="space-y-3" aria-labelledby="admins-title">
        <h2 id="admins-title" className="text-lg font-bold">
          Quản trị viên ({admins.length})
        </h2>
        <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
          {admins.map((a) => (
            <li key={a.id} className="flex items-center gap-3 p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ShieldCheck className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words font-semibold">
                  {a.full_name || "(chưa có tên)"} {a.id === meId && <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">Bạn</span>}
                </p>
                <p className="break-all text-xs text-muted-foreground">
                  {[displayPhone(a.phone), a.email].filter(Boolean).join(" · ") || "—"} · tạo {new Date(a.created_at).toLocaleDateString("vi-VN")}
                </p>
              </div>
              {canManage && a.id !== meId && admins.length > 1 && (
                <Button type="button" size="sm" variant="ghost" className="shrink-0 rounded-lg text-rose-600 hover:text-rose-700" onClick={() => setRemoving(a)}>
                  <Trash2 className="size-4" /> Thu hồi
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>
      {removing && <RemoveAdminSheet target={removing} onClose={() => setRemoving(null)} />}
    </div>
  );
}
