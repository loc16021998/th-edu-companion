"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, KeyRound, Loader2, Mail, Phone, Search, ShieldAlert, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/shared/form-field";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { CAMPUS_LABELS } from "@/config/constants";
import { cn } from "@/lib/utils";
import { resetAccountPassword } from "../actions";
import type { AccountRow } from "../queries";
import type { ManagedRole } from "../schema";
import { CopyButton, displayPhone, randomPassword } from "./account-manager";

const ROLE_TEXT: Record<ManagedRole, { one: string; linkEmpty: string }> = {
  parent: { one: "phụ huynh", linkEmpty: "Chưa liên kết học sinh" },
  teacher: { one: "giáo viên", linkEmpty: "Chưa phân công lớp" },
};

function ResetRow({ account, canManage }: { account: AccountRow; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const phone = displayPhone(account.phone);
  const login = phone ?? account.email ?? "";

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await resetAccountPassword(account.id, password);
      if (!res.ok) return setError(res.error);
      setDone(password);
      setOpen(false);
    });
  }

  const shareText = done
    ? `Tài khoản ${ROLE_TEXT[account.role].one} TH EDU Companion\nHọ tên: ${account.full_name}\nĐăng nhập: ${login}\nMật khẩu mới: ${done}`
    : "";

  return (
    <li className={cn("space-y-2 p-3", pending && "opacity-60")}>
      <div className="flex items-start gap-3">
        <StudentAvatar student={{ id: account.id, full_name: account.full_name || "?", avatar_url: null }} className="size-10 text-sm" />
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold">{account.full_name || "(Chưa có tên)"}</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {phone && (
              <span className="flex items-center gap-1">
                <Phone className="size-3" /> {phone}
              </span>
            )}
            {account.email && (
              <span className="flex min-w-0 items-center gap-1 [overflow-wrap:anywhere]">
                <Mail className="size-3 shrink-0" /> {account.email}
              </span>
            )}
            {account.campus && <span>{CAMPUS_LABELS[account.campus]}</span>}
          </p>
          <p className="mt-0.5 break-words text-xs font-medium text-muted-foreground">
            {account.links.length
              ? (account.role === "parent" ? account.links.map((l) => `Bé ${l}`) : account.links).join(" · ")
              : ROLE_TEXT[account.role].linkEmpty}
          </p>
        </div>
        {canManage && !open && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 rounded-lg"
            onClick={() => {
              setPassword(randomPassword());
              setDone(null);
              setError(null);
              setOpen(true);
            }}
          >
            <KeyRound /> <span className="hidden sm:inline">Đổi mật khẩu</span>
          </Button>
        )}
      </div>

      {open && (
        <div className="space-y-2 rounded-xl bg-muted/60 p-3 sm:ml-[3.25rem]">
          <label htmlFor={`pw-${account.id}`} className="text-xs font-semibold text-muted-foreground">
            Mật khẩu mới cho {account.full_name || ROLE_TEXT[account.role].one} (tối thiểu 8 ký tự)
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id={`pw-${account.id}`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              className={cn(fieldClass, "h-10 min-w-0 flex-1 font-mono")}
            />
            <Button type="button" variant="outline" className="h-10 rounded-lg" onClick={() => setPassword(randomPassword())} title="Tạo ngẫu nhiên">
              <Wand2 /> <span className="hidden sm:inline">Ngẫu nhiên</span>
            </Button>
          </div>
          <div className="flex gap-2">
            <Button type="button" className="h-10 rounded-lg" onClick={save} disabled={pending || password.length < 8}>
              {pending ? <Loader2 className="animate-spin" /> : <Check />} Lưu mật khẩu mới
            </Button>
            <Button type="button" variant="ghost" className="h-10 rounded-lg" onClick={() => setOpen(false)} disabled={pending}>
              <X /> Huỷ
            </Button>
          </div>
          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
        </div>
      )}

      {done && (
        <div className="space-y-2 rounded-xl bg-emerald-50 p-3 text-emerald-900 ring-1 ring-emerald-200 sm:ml-[3.25rem]">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold">Đã đổi mật khẩu — gửi thông tin này cho {ROLE_TEXT[account.role].one}:</p>
            <CopyButton text={shareText} />
          </div>
          <pre className="whitespace-pre-wrap break-all font-mono text-xs">{shareText}</pre>
        </div>
      )}
    </li>
  );
}

/** Danh sách tài khoản một loại (phụ huynh / giáo viên) để quản trị viên đặt mật khẩu mới. */
export function PasswordResetList({ role, accounts, canManage }: { role: ManagedRole; accounts: AccountRow[]; canManage: boolean }) {
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("vi");
    const digits = q.replace(/\D/g, "");
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.full_name.toLocaleLowerCase("vi").includes(q) ||
        a.email?.includes(q) ||
        (digits.length >= 3 && (displayPhone(a.phone) ?? "").replace(/\D/g, "").includes(digits)) ||
        a.links.some((l) => l.toLocaleLowerCase("vi").includes(q)),
    );
  }, [accounts, query]);

  return (
    <div className="space-y-4">
      {!canManage && (
        <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          Server chưa có SUPABASE_SERVICE_ROLE_KEY nên chưa đổi được mật khẩu. Thêm khoá này vào biến môi trường rồi khởi động lại.
        </p>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={role === "parent" ? "Tìm theo tên phụ huynh, SĐT, email, tên con..." : "Tìm theo tên giáo viên, SĐT, email, lớp..."}
          aria-label="Tìm tài khoản"
          className={cn(fieldClass, "pl-9")}
        />
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          {accounts.length === 0 ? `Chưa có tài khoản ${ROLE_TEXT[role].one} nào.` : "Không tìm thấy tài khoản phù hợp."}
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
          {visible.map((a) => (
            <ResetRow key={a.id} account={a} canManage={canManage} />
          ))}
        </ul>
      )}
    </div>
  );
}
