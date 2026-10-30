"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Building2, Clock, Crosshair, Loader2, LocateFixed, MapPin, Phone, School, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmSheet } from "@/components/ui/confirm-sheet";
import { fieldClass } from "@/components/shared/form-field";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { displayPhone, formatDistance, rankByDistance, telHref, type Campus, type CampusProfile } from "@/config/campuses";
import { cn, givenName } from "@/lib/utils";
import { cancelTransferRequest, submitTransferRequest } from "../actions";
import type { TransferRequest } from "../queries";
import { CampusMap } from "./campus-map";
import { DirectionsButtons } from "./directions-buttons";

type Child = { id: string; full_name: string; campus: Campus; class_name: string };

const STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Đang chờ trung tâm", tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  approved: { label: "Đã duyệt", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  rejected: { label: "Chưa duyệt", tone: "bg-rose-50 text-rose-700 ring-rose-200" },
  cancelled: { label: "Đã rút", tone: "bg-slate-100 text-slate-600 ring-slate-200" },
};

const dateFmt = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" });

function CampusDetail({ campus, kids, distance }: { campus: CampusProfile; kids: Child[]; distance: number | null }) {
  return (
    <article className="overflow-hidden rounded-3xl bg-card shadow-md ring-1 ring-border" aria-live="polite">
      <div className="relative aspect-[16/7] bg-gradient-to-br from-edu-blue-500 to-edu-blue-800">
        {campus.photoUrl ? (
          <Image src={campus.photoUrl} alt={`Mặt tiền TH EDU ${campus.name}`} fill sizes="(min-width: 768px) 640px, 100vw" className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center gap-3 text-white/90">
            <Building2 className="size-10" />
            <span className="text-lg font-extrabold">TH EDU {campus.name}</span>
          </div>
        )}
        {distance !== null && (
          <span className="absolute right-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-primary shadow">Cách bạn {formatDistance(distance)}</span>
        )}
      </div>
      <div className="space-y-4 p-4">
        <div className="space-y-1.5">
          <h2 className="text-lg font-extrabold">TH EDU {campus.name}</h2>
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary" /> {campus.address}
          </p>
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <Clock className="mt-0.5 size-4 shrink-0 text-primary" /> {campus.openingHours}
          </p>
        </div>

        {kids.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {kids.map((k) => (
              <span key={k.id} className="inline-flex items-center gap-1 rounded-full bg-edu-leaf-50 px-2.5 py-1 text-xs font-bold text-edu-leaf-800 ring-1 ring-edu-leaf-200">
                <School className="size-3.5" /> {givenName(k.full_name)} · Lớp {k.class_name}
              </span>
            ))}
          </div>
        )}

        {campus.contacts.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {campus.contacts.map((c) => (
              <li key={c.phone}>
                <a href={telHref(c.phone)} className="tap flex items-center gap-3 rounded-2xl bg-muted/60 p-3 ring-1 ring-border">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-500 text-white">
                    <Phone className="size-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold">{c.name}</span>
                    <span className="block text-sm tabular-nums text-muted-foreground">{displayPhone(c.phone)}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}

        <DirectionsButtons campus={campus} withCall={false} />
      </div>
    </article>
  );
}

function TransferSheet({
  open,
  onOpenChange,
  kids,
  campuses,
  initial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kids: Child[];
  campuses: CampusProfile[];
  initial: { childId: string; toCampus: Campus; distances: Partial<Record<Campus, number>> } | null;
}) {
  const [pending, startTransition] = useTransition();
  const [childId, setChildId] = useState(initial?.childId ?? kids[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const child = kids.find((k) => k.id === childId);
  const target = campuses.find((c) => c.campus !== child?.campus);
  const dist = initial?.distances ?? {};

  const submit = () =>
    startTransition(async () => {
      if (!child || !target) return;
      const res = await submitTransferRequest({
        studentId: child.id,
        toCampus: target.campus,
        reason,
        distanceFromKm: dist[child.campus] ?? null,
        distanceToKm: dist[target.campus] ?? null,
      });
      if (res.ok) {
        toast.success("Đã gửi đơn xin chuyển cơ sở", "Trung tâm sẽ xếp lớp phù hợp và báo lại anh/chị.");
        onOpenChange(false);
      } else toast.error("Chưa gửi được đơn", res.error);
    });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Xin chuyển cơ sở</SheetTitle>
          <SheetDescription>Trung tâm sẽ xếp bé vào lớp cùng trình độ tại cơ sở mới và báo lại anh/chị.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4">
          {kids.length > 1 && (
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Bé</span>
              <select value={childId} onChange={(e) => setChildId(e.target.value)} className={fieldClass}>
                {kids.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.full_name} · Lớp {k.class_name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {child && target && (
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center text-sm">
              <div className="rounded-2xl bg-muted p-3">
                <p className="text-xs text-muted-foreground">Đang học</p>
                <p className="font-bold">{campuses.find((c) => c.campus === child.campus)?.name}</p>
                {dist[child.campus] !== undefined && <p className="text-xs text-muted-foreground">{formatDistance(dist[child.campus]!)} từ nhà</p>}
              </div>
              <span aria-hidden className="text-lg font-bold text-primary">→</span>
              <div className="rounded-2xl bg-primary/10 p-3 ring-1 ring-primary/30">
                <p className="text-xs text-muted-foreground">Chuyển sang</p>
                <p className="font-bold text-primary">{target.name}</p>
                {dist[target.campus] !== undefined && <p className="text-xs text-muted-foreground">{formatDistance(dist[target.campus]!)} từ nhà</p>}
              </div>
            </div>
          )}
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Lý do (không bắt buộc)</span>
            <textarea
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Vd: gia đình chuyển nhà, cơ sở mới gần chỗ làm của bố mẹ…"
              className={cn(fieldClass, "h-auto resize-y py-2.5")}
            />
          </label>
          <Button type="button" className="h-12 w-full rounded-2xl text-base" disabled={pending || !child || !target} onClick={submit}>
            {pending ? <Loader2 className="animate-spin" /> : <Send />} Gửi đơn
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Bản đồ 2 cơ sở + thẻ chi tiết cơ sở đang chọn + "cơ sở nào gần nhà tôi" (định vị chỉ xử lý trên máy, không gửi toạ độ
 * lên máy chủ) + đơn xin chuyển cơ sở.
 */
export function CampusesExplorer({
  campuses,
  kids,
  selectedChildId,
  requests,
}: {
  campuses: CampusProfile[];
  kids: Child[];
  selectedChildId: string | null;
  requests: TransferRequest[];
}) {
  const child = kids.find((k) => k.id === selectedChildId) ?? kids[0] ?? null;
  const [selected, setSelected] = useState<Campus>(child?.campus ?? campuses[0]!.campus);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<{ childId: string; toCampus: Campus; distances: Partial<Record<Campus, number>> } | null>(null);
  const [cancelling, startCancel] = useTransition();

  const ranking = me ? rankByDistance(me, campuses) : null;
  const distances: Partial<Record<Campus, number>> = Object.fromEntries((ranking ?? []).map((r) => [r.campus.campus, r.km]));
  const current = campuses.find((c) => c.campus === selected) ?? campuses[0]!;
  const pending = requests.find((r) => r.status === "pending");
  const nearest = ranking?.[0];
  // Gợi ý chuyển khi cơ sở khác gần nhà hơn rõ rệt (> 1 km)
  const suggest =
    child && nearest && nearest.campus.campus !== child.campus && (distances[child.campus] ?? 0) - nearest.km > 1 && !pending ? nearest.campus : null;

  const locate = () => {
    if (!("geolocation" in navigator)) return setLocError("Trình duyệt không hỗ trợ định vị.");
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMe(p);
        const best = rankByDistance(p, campuses)[0];
        if (best) setSelected(best.campus.campus);
      },
      (err) => {
        setLocating(false);
        setLocError(
          err.code === err.PERMISSION_DENIED
            ? "Anh/chị chưa cho phép định vị. Mở Cài đặt trình duyệt → Quyền vị trí → Cho phép, rồi thử lại."
            : "Chưa xác định được vị trí (thử ra chỗ thoáng hoặc bật GPS).",
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  };

  return (
    <div className="space-y-5">
      {/* Bản đồ: chiều cao cố định → không nhảy bố cục khi tải */}
      <div className="space-y-1.5">
        <CampusMap campuses={campuses} selected={selected} childCampus={child?.campus} userLocation={me} onSelect={setSelected} className="h-64 sm:h-80" />
        {campuses.some((c) => !c.locationVerified) && (
          <p className="px-1 text-xs text-muted-foreground">Vị trí trên bản đồ đang là gần đúng — nút “Chỉ đường ngay” tìm theo địa chỉ chính xác.</p>
        )}
      </div>

      {/* Chọn nhanh cơ sở (chạm marker trên bản đồ cũng được) */}
      <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Chọn cơ sở">
        {campuses.map((c) => (
          <button
            key={c.campus}
            type="button"
            role="tab"
            aria-selected={selected === c.campus}
            onClick={() => setSelected(c.campus)}
            className={cn(
              "tap rounded-2xl p-3 text-left ring-1 transition-colors",
              selected === c.campus ? "bg-primary text-primary-foreground shadow-md ring-primary" : "bg-card ring-border",
            )}
          >
            <span className="block text-sm font-extrabold">{c.name}</span>
            <span className={cn("block text-xs", selected === c.campus ? "text-white/85" : "text-muted-foreground")}>
              {distances[c.campus] !== undefined ? `Cách bạn ${formatDistance(distances[c.campus]!)}` : c.campus === child?.campus ? "Bé đang học" : "Xem chi tiết"}
            </span>
          </button>
        ))}
      </div>

      <CampusDetail campus={current} kids={kids.filter((k) => k.campus === current.campus)} distance={distances[current.campus] ?? null} />

      {/* Cơ sở gần nhà */}
      <section className="space-y-3 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-border" aria-labelledby="nearest-heading">
        <h2 id="nearest-heading" className="flex items-center gap-2 text-base font-bold">
          <Crosshair className="size-5 text-primary" /> Cơ sở nào gần nhà tôi?
        </h2>
        {ranking ? (
          <ol className="space-y-2">
            {ranking.map((r, i) => (
              <li key={r.campus.campus} className={cn("flex items-center justify-between gap-2 rounded-2xl p-3 ring-1", i === 0 ? "bg-emerald-50 ring-emerald-200" : "bg-muted/40 ring-border")}>
                <span className="text-sm font-bold">
                  {i === 0 && <span className="mr-1.5 rounded-full bg-emerald-600 px-2 py-0.5 text-xs text-white">Gần nhất</span>}
                  {r.campus.name}
                </span>
                <span className="text-sm font-semibold tabular-nums">{formatDistance(r.km)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Cho phép định vị để biết khoảng cách từ chỗ anh/chị tới từng cơ sở. Vị trí chỉ dùng trên điện thoại này, không gửi lên hệ thống.</p>
        )}
        {locError && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">{locError}</p>}
        <Button type="button" variant={ranking ? "outline" : "default"} className="h-11 w-full rounded-2xl" disabled={locating} onClick={locate}>
          {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />} {ranking ? "Định vị lại" : "Dùng vị trí của tôi"}
        </Button>
        {ranking && <p className="text-xs text-muted-foreground">Khoảng cách đường chim bay — quãng đường thực tế xem khi bấm “Chỉ đường ngay”.</p>}
        {suggest && child && (
          <div className="space-y-2 rounded-2xl bg-sky-50 p-3 ring-1 ring-sky-200">
            <p className="text-sm text-sky-950">
              <span className="font-bold">{suggest.name}</span> gần nhà hơn {formatDistance((distances[child.campus] ?? 0) - (distances[suggest.campus] ?? 0))} so với cơ sở bé {givenName(child.full_name)} đang học.
            </p>
            <Button type="button" size="sm" className="min-h-9 rounded-xl" onClick={() => setTransfer({ childId: child.id, toCampus: suggest.campus, distances })}>
              Xin chuyển sang {suggest.name}
            </Button>
          </div>
        )}
      </section>

      {/* Đơn xin chuyển cơ sở */}
      {kids.length > 0 && (
        <section className="space-y-3" aria-labelledby="transfer-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="transfer-heading" className="text-base font-bold">
              Xin chuyển cơ sở
            </h2>
            {!pending && (
              <Button type="button" variant="outline" size="sm" className="min-h-9 rounded-xl" onClick={() => setTransfer({ childId: child?.id ?? kids[0]!.id, toCampus: campuses.find((c) => c.campus !== child?.campus)!.campus, distances })}>
                Tạo đơn
              </Button>
            )}
          </div>
          {requests.length === 0 ? (
            <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground shadow-sm ring-1 ring-border">Chưa có đơn nào.</p>
          ) : (
            <ul className="space-y-2">
              {requests.map((r) => {
                const kid = kids.find((k) => k.id === r.student_id);
                const st = STATUS[r.status] ?? STATUS.pending!;
                return (
                  <li key={r.id} className="space-y-2 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold">
                        {kid ? givenName(kid.full_name) : "Bé"}: {campuses.find((c) => c.campus === r.from_campus)?.name} → {campuses.find((c) => c.campus === r.to_campus)?.name}
                      </p>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold ring-1", st.tone)}>{st.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Gửi {dateFmt.format(new Date(r.created_at))}
                      {r.new_class_name && ` · Lớp mới: ${r.new_class_name}`}
                    </p>
                    {r.admin_note && <p className="rounded-xl bg-muted/60 p-2.5 text-sm">{r.admin_note}</p>}
                    {r.status === "pending" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-9 rounded-xl text-destructive"
                        disabled={cancelling}
                        onClick={() =>
                          startCancel(async () => {
                            if (!(await confirmSheet({ title: "Rút đơn xin chuyển cơ sở?", confirmLabel: "Rút đơn", tone: "danger" }))) return;
                            const res = await cancelTransferRequest(r.id);
                            if (res.ok) toast.success("Đã rút đơn");
                            else toast.error("Chưa rút được đơn", res.error);
                          })
                        }
                      >
                        Rút đơn
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {transfer && <TransferSheet key={`${transfer.childId}:${transfer.toCampus}`} open onOpenChange={(o) => !o && setTransfer(null)} kids={kids} campuses={campuses} initial={transfer} />}
    </div>
  );
}
