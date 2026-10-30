"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import { Loader2, MapPinOff } from "lucide-react";
import type { Campus, CampusProfile } from "@/config/campuses";
import { cn } from "@/lib/utils";

/**
 * Ảnh nền bản đồ (không cần API key), theo thứ tự thử:
 *  1. NEXT_PUBLIC_MAP_TILE_URL (tuỳ chọn) — nhà cung cấp trung tâm đăng ký (MapTiler, Stadia…), vd "https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=…"
 *  2. OpenStreetMap (máy chủ cộng đồng Đức — tile.openstreetmap.org bị một số mạng tại VN chặn ở DNS)
 *  3. Esri World Street Map — tự chuyển sang khi nguồn trước lỗi liên tục (mạng chặn / quá tải)
 * Đổi / thêm nguồn → cập nhật img-src trong src/lib/security/csp.ts.
 */
const TILE_SOURCES = [
  ...(process.env.NEXT_PUBLIC_MAP_TILE_URL ? [{ url: process.env.NEXT_PUBLIC_MAP_TILE_URL, attribution: "&copy; OpenStreetMap contributors", subdomains: "abc" }] : []),
  { url: "https://tile.openstreetmap.de/{z}/{x}/{y}.png", attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', subdomains: "abc" },
  { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", attribution: "Tiles &copy; Esri", subdomains: "abc" },
];
/** Số ô ảnh lỗi trước khi chuyển sang nguồn dự phòng */
const TILE_ERRORS_BEFORE_FALLBACK = 4;

function markerHtml(c: CampusProfile, selected: boolean, mine: boolean) {
  return `<div class="th-marker${selected ? " th-marker--selected" : ""}">
    <span class="th-marker__pin"><img src="/icons/favicon-48.png" alt="" width="24" height="24" /></span>
    <span class="th-marker__label">${c.short}${mine ? " · Lớp của bé" : ""}</span>
  </div>`;
}

/**
 * Bản đồ 2 cơ sở với marker thương hiệu TH EDU. Leaflet (~42KB gzip) chỉ nạp khi khung bản đồ sắp hiện trên màn hình
 * → không ảnh hưởng lần tải trang. Khung có chiều cao cố định → không xô lệch bố cục khi bản đồ nạp xong.
 */
export function CampusMap({
  campuses,
  selected,
  childCampus,
  userLocation,
  onSelect,
  className,
}: {
  campuses: CampusProfile[];
  selected: Campus | null;
  childCampus?: Campus | null;
  userLocation?: { lat: number; lng: number } | null;
  onSelect: (campus: Campus) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const markers = useRef(new Map<Campus, Marker>());
  const userMarker = useRef<Marker | null>(null);
  const leaflet = useRef<typeof import("leaflet") | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  // Nạp Leaflet khi khung bản đồ cách màn hình ≤ 200px
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const markerMap = markers.current;
    let disposed = false;
    const io = new IntersectionObserver(
      async ([entry]) => {
        if (!entry?.isIntersecting || map.current) return;
        io.disconnect();
        setStatus("loading");
        try {
          const L = (await import("./leaflet-loader")).default;
          if (disposed || !box.current) return;
          leaflet.current = L;
          const m = L.map(box.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false, tapHold: false });
          L.control.zoom({ position: "bottomright" }).addTo(m);
          // Nguồn ảnh nền lỗi liên tục → chuyển sang nguồn kế tiếp
          const addTiles = (i: number) => {
            const src = TILE_SOURCES[i];
            if (!src) return;
            let errors = 0;
            const layer = L.tileLayer(src.url, { attribution: src.attribution, maxZoom: 19, subdomains: src.subdomains }).addTo(m);
            layer.on("tileerror", () => {
              errors += 1;
              if (errors === TILE_ERRORS_BEFORE_FALLBACK && TILE_SOURCES[i + 1]) {
                m.removeLayer(layer);
                addTiles(i + 1);
              }
            });
          };
          addTiles(0);
          m.fitBounds(L.latLngBounds(campuses.map((c) => [c.lat, c.lng])), { padding: [48, 48], maxZoom: 15 });
          map.current = m;
          setStatus("ready");
        } catch (err) {
          console.error("[campuses] Không tải được bản đồ:", err);
          setStatus("error");
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => {
      disposed = true;
      io.disconnect();
      map.current?.remove();
      map.current = null;
      markerMap.clear();
    };
    // campuses chỉ dùng cho khung nhìn ban đầu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marker cơ sở: vẽ lại khi đổi cơ sở đang chọn
  useEffect(() => {
    const L = leaflet.current;
    const m = map.current;
    if (status !== "ready" || !L || !m) return;
    for (const c of campuses) {
      const icon = L.divIcon({ html: markerHtml(c, c.campus === selected, c.campus === childCampus), className: "", iconSize: [0, 0], iconAnchor: [0, 0] });
      const existing = markers.current.get(c.campus);
      if (existing) {
        existing.setIcon(icon).setLatLng([c.lat, c.lng]);
      } else {
        const mk = L.marker([c.lat, c.lng], { icon, keyboard: true, title: `TH EDU ${c.name}`, riseOnHover: true })
          .addTo(m)
          .on("click", () => onSelectRef.current(c.campus));
        markers.current.set(c.campus, mk);
      }
      if (c.campus === selected) markers.current.get(c.campus)?.setZIndexOffset(1000);
      else markers.current.get(c.campus)?.setZIndexOffset(0);
    }
    const sel = campuses.find((c) => c.campus === selected);
    if (sel) m.panTo([sel.lat, sel.lng], { animate: true });
  }, [status, campuses, selected, childCampus]);

  // Vị trí của phụ huynh (khi đã cho phép định vị) + khung nhìn bao cả nhà và 2 cơ sở
  useEffect(() => {
    const L = leaflet.current;
    const m = map.current;
    if (status !== "ready" || !L || !m || !userLocation) return;
    const icon = L.divIcon({ html: '<span class="th-me" aria-label="Vị trí của bạn"></span>', className: "", iconSize: [0, 0] });
    if (userMarker.current) userMarker.current.setLatLng([userLocation.lat, userLocation.lng]);
    else userMarker.current = L.marker([userLocation.lat, userLocation.lng], { icon, interactive: false }).addTo(m);
    m.fitBounds(L.latLngBounds([...campuses.map((c) => [c.lat, c.lng] as [number, number]), [userLocation.lat, userLocation.lng]]), { padding: [40, 40], maxZoom: 15 });
  }, [status, userLocation, campuses]);

  return (
    <div className={cn("relative isolate overflow-hidden rounded-3xl bg-sky-50 shadow-sm ring-1 ring-border", className)}>
      <div ref={box} className="h-full w-full" role="application" aria-label="Bản đồ các cơ sở TH EDU — chạm vào biểu tượng để xem chi tiết" />
      {status !== "ready" && (
        <div className="absolute inset-0 z-[500] flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          {status === "error" ? (
            <>
              <MapPinOff className="size-6" /> Không tải được bản đồ — vẫn dùng được nút “Chỉ đường”.
            </>
          ) : (
            <>
              <Loader2 className="size-6 animate-spin text-primary" /> Đang tải bản đồ…
            </>
          )}
        </div>
      )}
    </div>
  );
}
