"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Building2, CheckCircle2, ImageUp, Loader2, MapPin, Plus, Save, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/shared/form-field";
import { toast } from "@/components/ui/toast";
import { displayPhone, formatDistance, googleDirectionsUrl, parseGoogleMapsCoords, type Campus, type CampusProfile } from "@/config/campuses";
import { compressImage } from "@/lib/images/compress";
import { cn } from "@/lib/utils";
import { decideTransferRequest, updateCampusProfile, uploadCampusPhoto } from "../actions";
import type { AdminTransferRequest } from "../queries";

const label = "space-y-1.5 text-xs font-semibold text-muted-foreground";

/** Sửa hồ sơ 1 cơ sở: dán link Google Maps → tự lấy toạ độ chính xác; hotline; giờ mở cửa; ảnh mặt tiền. */
export function CampusProfileEditor({ campus }: { campus: CampusProfile }) {
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState(campus.name);
  const [address, setAddress] = useState(campus.address);
  const [mapsUrl, setMapsUrl] = useState(campus.googleMapsUrl ?? "");
  const [lat, setLat] = useState(String(campus.lat));
  const [lng, setLng] = useState(String(campus.lng));
  const [verified, setVerified] = useState(campus.locationVerified);
  const [hours, setHours] = useState(campus.openingHours);
  const [contacts, setContacts] = useState(campus.contacts.map((c) => ({ name: c.name, phone: displayPhone(c.phone) })));
  const [photo, setPhoto] = useState(campus.photoUrl);
  const [mapsHint, setMapsHint] = useState<string | null>(null);

  const onMapsUrl = (v: string) => {
    setMapsUrl(v);
    if (!v.trim()) return setMapsHint(null);
    const coords = parseGoogleMapsCoords(v);
    if (coords) {
      setLat(coords.lat.toFixed(6));
      setLng(coords.lng.toFixed(6));
      setVerified(true);
      setMapsHint(`Đã lấy toạ độ ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)} từ link.`);
    } else {
      setMapsHint("Link rút gọn (maps.app.goo.gl) không chứa toạ độ: mở link trên máy tính, đợi bản đồ hiện xong rồi copy link trên thanh địa chỉ — hoặc nhập toạ độ bên dưới (chuột phải vào điểm trên Google Maps → bấm vào dòng toạ độ để copy).");
    }
  };

  const save = () =>
    startTransition(async () => {
      const res = await updateCampusProfile({
        campus: campus.campus,
        name,
        address,
        lat: Number(lat),
        lng: Number(lng),
        locationVerified: verified,
        googleMapsUrl: mapsUrl,
        contacts: contacts.filter((c) => c.name.trim() || c.phone.trim()),
        openingHours: hours,
      });
      if (res.ok) toast.success(`Đã lưu ${name}`, "Phụ huynh thấy thông tin mới ngay.");
      else toast.error("Chưa lưu được", res.error);
    });

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const blob = await compressImage(file, { maxBytes: 300 * 1024, maxDimension: 1600 });
      const fd = new FormData();
      fd.set("campus", campus.campus);
      fd.set("photo", new File([blob], "mat-tien.jpg", { type: blob.type || "image/jpeg" }));
      const res = await uploadCampusPhoto(fd);
      if (res.ok) {
        setPhoto(res.data.url);
        toast.success("Đã cập nhật ảnh mặt tiền");
      } else toast.error("Chưa tải được ảnh", res.error);
    } catch {
      toast.error("Không đọc được ảnh", "Chọn ảnh JPG / PNG khác.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="space-y-4 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-border">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-extrabold">{campus.name}</h2>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1",
            verified ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-800 ring-amber-200",
          )}
        >
          {verified ? <CheckCircle2 className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
          {verified ? "Toạ độ đã xác minh" : "Toạ độ gần đúng — chỉ đường theo địa chỉ"}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
        <div className="space-y-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-br from-edu-blue-500 to-edu-blue-800">
            {photo ? (
              <Image src={photo} alt={`Mặt tiền ${campus.name}`} fill sizes="224px" className="object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-white/80">
                <Building2 className="size-10" />
              </div>
            )}
          </div>
          <label className={cn("tap flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl text-sm font-semibold ring-1 ring-border", uploading && "opacity-60")}>
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />} {photo ? "Đổi ảnh mặt tiền" : "Tải ảnh mặt tiền"}
            <input type="file" accept="image/*" className="sr-only" disabled={uploading} onChange={(e) => void onPhoto(e.target.files?.[0])} />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Tên hiển thị
            <input value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} />
          </label>
          <label className={label}>
            Giờ mở cửa
            <input value={hours} onChange={(e) => setHours(e.target.value)} className={fieldClass} />
          </label>
          <label className={cn(label, "sm:col-span-2")}>
            Địa chỉ
            <input value={address} onChange={(e) => setAddress(e.target.value)} className={fieldClass} />
          </label>
          <label className={cn(label, "sm:col-span-2")}>
            Link Google Maps của cơ sở
            <input value={mapsUrl} onChange={(e) => onMapsUrl(e.target.value)} placeholder="https://www.google.com/maps/place/…" className={fieldClass} inputMode="url" />
            {mapsHint && <span className="block font-medium text-foreground">{mapsHint}</span>}
          </label>
          <label className={label}>
            Vĩ độ (lat)
            <input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" className={fieldClass} />
          </label>
          <label className={label}>
            Kinh độ (lng)
            <input value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" className={fieldClass} />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
            <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="size-4 accent-primary" />
            Toạ độ đúng tại cửa cơ sở (nút “Chỉ đường” dẫn thẳng tới điểm này)
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-bold">Hotline cơ sở</p>
        {contacts.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input aria-label="Tên" value={c.name} onChange={(e) => setContacts((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Cô Hường" className={fieldClass} />
            <input aria-label="Số điện thoại" value={c.phone} inputMode="tel" onChange={(e) => setContacts((l) => l.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} placeholder="0978 951 289" className={fieldClass} />
            <Button type="button" variant="ghost" size="icon" className="size-11 rounded-xl text-destructive" aria-label="Xoá" onClick={() => setContacts((l) => l.filter((_, j) => j !== i))}>
              <Trash2 />
            </Button>
          </div>
        ))}
        {contacts.length < 6 && (
          <Button type="button" variant="outline" size="sm" className="min-h-9 rounded-lg" onClick={() => setContacts((l) => [...l, { name: "", phone: "" }])}>
            <Plus /> Thêm số
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-11 rounded-xl" disabled={pending} onClick={save}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Lưu {name}
        </Button>
        <Button asChild variant="outline" className="h-11 rounded-xl">
          <a href={googleDirectionsUrl({ lat: Number(lat), lng: Number(lng), address, locationVerified: verified })} target="_blank" rel="noopener noreferrer">
            <MapPin /> Thử chỉ đường
          </a>
        </Button>
      </div>
    </section>
  );
}

const STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Chờ duyệt", tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  approved: { label: "Đã duyệt", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  rejected: { label: "Từ chối", tone: "bg-rose-50 text-rose-700 ring-rose-200" },
  cancelled: { label: "PH đã rút", tone: "bg-slate-100 text-slate-600 ring-slate-200" },
};

function TransferItem({ req, classes, campusName }: { req: AdminTransferRequest; classes: { id: string; campus: Campus; name: string }[]; campusName: (c: Campus) => string }) {
  const [pending, startTransition] = useTransition();
  const [classId, setClassId] = useState("");
  const [note, setNote] = useState("");
  const st = STATUS[req.status] ?? STATUS.pending!;
  const targetClasses = classes.filter((c) => c.campus === req.to_campus);

  const decide = (decision: "approved" | "rejected") =>
    startTransition(async () => {
      const res = await decideTransferRequest({ id: req.id, decision, classId: decision === "approved" ? classId || null : null, note });
      if (res.ok) toast.success(decision === "approved" ? "Đã chuyển bé sang cơ sở mới" : "Đã từ chối đơn", "Phụ huynh nhận thông báo ngay.");
      else toast.error("Chưa xử lý được", res.error);
    });

  return (
    <li className={cn("space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1", req.status === "pending" ? "ring-2 ring-amber-300" : "ring-border")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold">
            {req.student?.full_name ?? "Học sinh"} <span className="font-medium text-muted-foreground">· Lớp {req.student?.class_name}</span>
          </p>
          <p className="text-sm">
            {campusName(req.from_campus)} → <span className="font-bold text-primary">{campusName(req.to_campus)}</span>
            {req.distance_from_km !== null && req.distance_to_km !== null && (
              <span className="text-muted-foreground">
                {" "}
                · nhà cách {formatDistance(Number(req.distance_from_km))} → {formatDistance(Number(req.distance_to_km))}
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            PH {req.parent?.full_name}
            {req.parent?.phone && ` · ${displayPhone(req.parent.phone)}`}
          </p>
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold ring-1", st.tone)}>{st.label}</span>
      </div>
      {req.reason && <p className="rounded-xl bg-muted/60 p-2.5 text-sm">{req.reason}</p>}
      {req.status === "pending" ? (
        <div className="grid gap-2 sm:grid-cols-[14rem_1fr]">
          <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Lớp mới" className={fieldClass}>
            <option value="">— Lớp mới ở {campusName(req.to_campus)} —</option>
            {targetClasses.map((c) => (
              <option key={c.id} value={c.id}>
                Lớp {c.name}
              </option>
            ))}
          </select>
          <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Lời nhắn cho phụ huynh (không bắt buộc)" className={fieldClass} />
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="button" className="h-10 rounded-xl" disabled={pending || !classId} onClick={() => decide("approved")}>
              {pending && <Loader2 className="animate-spin" />} Duyệt & chuyển lớp
            </Button>
            <Button type="button" variant="outline" className="h-10 rounded-xl" disabled={pending} onClick={() => decide("rejected")}>
              Từ chối
            </Button>
          </div>
        </div>
      ) : (
        (req.admin_note || req.new_class_name) && (
          <p className="text-sm text-muted-foreground">
            {req.new_class_name && `Lớp mới: ${req.new_class_name}. `}
            {req.admin_note}
          </p>
        )
      )}
    </li>
  );
}

export function TransferRequestsAdmin({
  requests,
  classes,
  campuses,
}: {
  requests: AdminTransferRequest[];
  classes: { id: string; campus: Campus; name: string }[];
  campuses: CampusProfile[];
}) {
  const campusName = (c: Campus) => campuses.find((x) => x.campus === c)?.name ?? c;
  if (requests.length === 0) return <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground shadow-sm ring-1 ring-border">Chưa có đơn xin chuyển cơ sở.</p>;
  return (
    <ul className="space-y-3">
      {requests.map((r) => (
        <TransferItem key={`${r.id}:${r.status}`} req={r} classes={classes} campusName={campusName} />
      ))}
    </ul>
  );
}
