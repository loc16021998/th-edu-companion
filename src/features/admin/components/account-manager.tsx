"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Copy, GraduationCap, KeyRound, Loader2, Mail, Phone, Search, ShieldAlert, Trash2, UserPlus, UsersRound, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, SubmitButton, fieldClass, useFormAction } from "@/components/shared/form-field";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { CAMPUS_LABELS } from "@/config/constants";
import { cn } from "@/lib/utils";
import type { Enums } from "@/types/database.types";
import { createAccount, deleteAccount, resetAccountPassword } from "../actions";
import type { AccountRow } from "../queries";
import type { ManagedRole } from "../schema";
import { confirmSheet } from "@/components/ui/confirm-sheet";

const CAMPUSES = Object.entries(CAMPUS_LABELS) as [Enums<"campus">, string][];

const ROLES: Record<ManagedRole, { label: string; icon: typeof UsersRound }> = {
  parent: { label: "Phụ huynh", icon: UsersRound },
  teacher: { label: "Giáo viên", icon: GraduationCap },
};

/** Mật khẩu dễ đọc qua điện thoại: bỏ các ký tự dễ nhầm (0/O, 1/l/I). */
export function randomPassword(length = 10) {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function displayPhone(phone: string | null) {
  if (!phone) return null;
  const national = phone.replace(/^\+?84/, "0");
  return national.replace(/^(\d{4})(\d{3})(\d+)$/, "$1 $2 $3");
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-8 rounded-lg"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check /> : <Copy />} {copied ? "Đã chép" : "Chép"}
    </Button>
  );
}

type Credentials = { role: ManagedRole; name: string; login: string; password: string };

function CreateAccountForm({ initialRole, canManage }: { initialRole: ManagedRole; canManage: boolean }) {
  const { state, pending, formRef, onSubmit, errors: err } = useFormAction(createAccount);
  const [role, setRole] = useState<ManagedRole>(initialRole);
  const [password, setPassword] = useState("");
  const [creds, setCreds] = useState<Credentials | null>(null);

  const credsText = creds
    ? `Tài khoản ${ROLES[creds.role].label.toLowerCase()} TH EDU Companion\nHọ tên: ${creds.name}\nĐăng nhập: ${creds.login}\nMật khẩu: ${creds.password}\nChọn mục "${ROLES[creds.role].label}" khi đăng nhập.`
    : "";

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        const fd = new FormData(e.currentTarget);
        const phone = String(fd.get("phone") ?? "").trim();
        const email = String(fd.get("email") ?? "").trim();
        setCreds({ role, name: String(fd.get("fullName") ?? "").trim(), login: phone || email, password });
        onSubmit(e);
      }}
      onReset={() => setPassword("")}
      className="space-y-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border"
    >
      <h2 className="flex items-center gap-2 font-bold">
        <UserPlus className="size-5 text-primary" /> Tạo tài khoản mới
      </h2>

      {!canManage && (
        <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          Server chưa có SUPABASE_SERVICE_ROLE_KEY nên chưa tạo / đặt lại mật khẩu được. Thêm khoá này vào biến môi trường rồi khởi động lại.
        </p>
      )}

      <input type="hidden" name="role" value={role} />
      <div role="radiogroup" aria-label="Loại tài khoản" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {(Object.keys(ROLES) as ManagedRole[]).map((key) => {
          const { label, icon: Icon } = ROLES[key];
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={role === key}
              onClick={() => setRole(key)}
              className={cn(
                "flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors",
                role === key ? "bg-background text-primary shadow-sm" : "text-muted-foreground",
              )}
            >
              <Icon className="size-4" /> {label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Họ và tên" htmlFor="a-name" error={err.fullName}>
          <input id="a-name" name="fullName" className={fieldClass} required autoComplete="off" aria-invalid={!!err.fullName} />
        </Field>
        <Field label={role === "teacher" ? "Cơ sở" : "Cơ sở (không bắt buộc)"} htmlFor="a-campus" error={err.campus}>
          <select id="a-campus" name="campus" className={fieldClass} defaultValue="" key={role}>
            <option value="" disabled={role === "teacher"}>
              {role === "teacher" ? "— Chọn cơ sở —" : "— Không chọn —"}
            </option>
            {CAMPUSES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Số điện thoại (dùng để đăng nhập)" htmlFor="a-phone" error={err.phone}>
          <input id="a-phone" name="phone" type="tel" inputMode="tel" className={fieldClass} placeholder="0912 345 678" autoComplete="off" />
        </Field>
        <Field label="Email (không bắt buộc)" htmlFor="a-email" error={err.email}>
          <input id="a-email" name="email" type="email" className={fieldClass} placeholder="ten@email.com" autoComplete="off" />
        </Field>
        <Field label="Mật khẩu" htmlFor="a-password" error={err.password} hint="Tối thiểu 8 ký tự." className="sm:col-span-2">
          <div className="flex gap-2">
            <input
              id="a-password"
              name="password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={cn(fieldClass, "font-mono")}
              minLength={8}
              required
              autoComplete="new-password"
            />
            <Button type="button" variant="outline" className="h-11 shrink-0 rounded-xl" onClick={() => setPassword(randomPassword())}>
              <Wand2 /> Tạo ngẫu nhiên
            </Button>
          </div>
        </Field>
      </div>

      <FormMessage state={state} />
      {state.ok && creds && (
        <div className="space-y-2 rounded-xl bg-muted p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground">Gửi thông tin đăng nhập cho {ROLES[creds.role].label.toLowerCase()}:</p>
            <CopyButton text={credsText} />
          </div>
          <pre className="whitespace-pre-wrap break-all font-mono text-xs">{credsText}</pre>
        </div>
      )}
      <SubmitButton pending={pending} pendingText="Đang tạo..." className="w-full sm:w-auto">
        <UserPlus /> Tạo tài khoản {ROLES[role].label.toLowerCase()}
      </SubmitButton>
    </form>
  );
}

function AccountItem({ account, canManage }: { account: AccountRow; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  const [resetting, setResetting] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const phone = displayPhone(account.phone);

  function savePassword() {
    setMessage(null);
    startTransition(async () => {
      const res = await resetAccountPassword(account.id, password);
      if (!res.ok) return setMessage({ ok: false, text: res.error });
      setMessage({ ok: true, text: `Đã đặt mật khẩu mới: ${password}` });
      setResetting(false);
    });
  }

  async function remove() {
    const extra = account.role === "parent" && account.links.length ? " Học sinh vẫn được giữ lại nhưng bỏ liên kết với phụ huynh." : "";
    if (!(await confirmSheet({ title: `Xoá tài khoản ${account.full_name}?`, description: `Người này sẽ không đăng nhập được nữa.${extra}`, confirmLabel: "Xoá tài khoản", tone: "danger" }))) return;
    setMessage(null);
    startTransition(async () => {
      const res = await deleteAccount(account.id);
      if (!res.ok) setMessage({ ok: false, text: res.error });
    });
  }

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
          <div className="mt-1 flex flex-wrap gap-1">
            {account.links.length ? (
              account.links.map((l, i) => (
                <span key={i} className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
                  {account.role === "parent" ? `Bé ${l}` : l}
                </span>
              ))
            ) : (
              <span className="text-xs font-medium text-amber-600">
                {account.role === "parent" ? "Chưa liên kết học sinh" : "Chưa phân công lớp"}
              </span>
            )}
          </div>
        </div>
        {canManage && (
          <div className="flex shrink-0 gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                setResetting((v) => !v);
                setPassword(randomPassword());
                setMessage(null);
              }}
              disabled={pending}
              aria-label={`Đặt lại mật khẩu cho ${account.full_name}`}
              title="Đặt lại mật khẩu"
            >
              <KeyRound />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={remove} disabled={pending} aria-label={`Xoá tài khoản ${account.full_name}`} title="Xoá tài khoản">
              <Trash2 />
            </Button>
          </div>
        )}
      </div>

      {resetting && (
        <div className="flex gap-2 pl-[3.25rem]">
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="Mật khẩu mới"
            minLength={8}
            className={cn(fieldClass, "h-9 font-mono")}
          />
          <Button type="button" size="sm" className="h-9 rounded-lg" onClick={savePassword} disabled={pending || password.length < 8}>
            {pending ? <Loader2 className="animate-spin" /> : <Check />} Lưu
          </Button>
        </div>
      )}
      {message && (
        <div className={cn("flex items-center gap-2 pl-[3.25rem] text-xs font-medium", message.ok ? "text-emerald-700" : "text-destructive")}>
          <span className="flex-1">{message.text}</span>
          {message.ok && <CopyButton text={password} />}
        </div>
      )}
    </li>
  );
}

export function AccountManager({
  accounts,
  initialRole,
  canManage,
}: {
  accounts: AccountRow[];
  initialRole: ManagedRole;
  canManage: boolean;
}) {
  const [tab, setTab] = useState<ManagedRole>(initialRole);
  const [query, setQuery] = useState("");

  const counts = { parent: 0, teacher: 0 };
  for (const a of accounts) counts[a.role]++;

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("vi");
    const digits = q.replace(/\D/g, "");
    return accounts.filter(
      (a) =>
        a.role === tab &&
        (!q ||
          a.full_name.toLocaleLowerCase("vi").includes(q) ||
          a.email?.includes(q) ||
          (digits.length >= 3 && (displayPhone(a.phone) ?? "").replace(/\D/g, "").includes(digits)) ||
          a.links.some((l) => l.toLocaleLowerCase("vi").includes(q))),
    );
  }, [accounts, tab, query]);

  return (
    <div className="space-y-5">
      <CreateAccountForm initialRole={initialRole} canManage={canManage} />

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Danh sách tài khoản</h2>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          {(Object.keys(ROLES) as ManagedRole[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className={cn(
                "h-9 rounded-lg text-sm font-semibold transition-colors",
                tab === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {ROLES[key].label} ({counts[key]})
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo tên, SĐT, email, tên con / lớp..."
            aria-label="Tìm tài khoản"
            className={cn(fieldClass, "pl-9")}
          />
        </div>

        {visible.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            {counts[tab] === 0 ? `Chưa có tài khoản ${ROLES[tab].label.toLowerCase()} nào.` : "Không tìm thấy tài khoản phù hợp."}
          </p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
            {visible.map((a) => (
              <AccountItem key={a.id} account={a} canManage={canManage} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
