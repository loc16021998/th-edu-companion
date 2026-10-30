// Thông tin 2 cơ sở TH EDU — mặc định khi database chưa có bảng campus_profiles (apply-campuses.sql).
// Dữ liệu chính thức sửa tại Admin → Cơ sở & bản đồ (dán link Google Maps → tự lấy toạ độ chính xác).
// Module thuần — dùng chung server + client.
import type { Enums } from "@/types/database.types";

export type Campus = Enums<"campus">;
export type CampusContact = { name: string; phone: string };

export type CampusProfile = {
  campus: Campus;
  name: string;
  short: string;
  address: string;
  lat: number;
  lng: number;
  /** false = toạ độ gần đúng theo khu vực → chỉ đường theo địa chỉ chữ (Google Maps tự tìm đúng số nhà) */
  locationVerified: boolean;
  googleMapsUrl: string | null;
  contacts: CampusContact[];
  openingHours: string;
  photoUrl: string | null;
};

export const OPENING_HOURS = "Sáng 8:00 – 11:30 · Chiều 14:00 – 20:30";

/**
 * Toạ độ GẦN ĐÚNG theo khu vực (OpenStreetMap) — CHƯA xác minh tại số nhà.
 * Hotline: số trên footer của trung tâm; phân công cô / thầy theo cơ sở cần trung tâm xác nhận.
 */
export const DEFAULT_CAMPUSES: Record<Campus, CampusProfile> = {
  CS1_XALA: {
    campus: "CS1_XALA",
    name: "CS1 Xa La",
    short: "CS1",
    address: "Số 26 LK2, Khu đô thị Xa La, Hà Đông, Hà Nội",
    lat: 20.964,
    lng: 105.7905,
    locationVerified: false,
    googleMapsUrl: null,
    contacts: [{ name: "Cô Hường", phone: "+84978951289" }],
    openingHours: OPENING_HOURS,
    photoUrl: null,
  },
  CS2_NGOTHINHAM: {
    campus: "CS2_NGOTHINHAM",
    name: "CS2 Ngô Thì Nhậm",
    short: "CS2",
    address: "LK 24 ô 48 Ngô Thì Nhậm, Hà Đông, Hà Nội",
    lat: 20.9585,
    lng: 105.779,
    locationVerified: false,
    googleMapsUrl: null,
    contacts: [{ name: "Thầy Tú", phone: "+84982194144" }],
    openingHours: OPENING_HOURS,
    photoUrl: null,
  },
};

export const CAMPUS_ORDER: Campus[] = ["CS1_XALA", "CS2_NGOTHINHAM"];

// ----------------------------------------------------------------------------- Khoảng cách

/** Khoảng cách đường chim bay (km) — công thức Haversine. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "850 m" · "3,2 km" */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  return `${km.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km`;
}

/** Cơ sở gần vị trí `from` nhất + khoảng cách tới từng cơ sở (gần → xa). */
export function rankByDistance(from: { lat: number; lng: number }, campuses: CampusProfile[]) {
  return campuses.map((c) => ({ campus: c, km: distanceKm(from, c) })).sort((a, b) => a.km - b.km);
}

// ----------------------------------------------------------------------------- Chỉ đường

const destinationOf = (c: Pick<CampusProfile, "lat" | "lng" | "address" | "locationVerified">) =>
  c.locationVerified ? `${c.lat},${c.lng}` : c.address;

/**
 * Google Maps chỉ đường từ VỊ TRÍ HIỆN TẠI (không truyền origin) tới cơ sở.
 * Điện thoại có app Google Maps → mở thẳng app; không có → bản web.
 */
export function googleDirectionsUrl(c: Pick<CampusProfile, "lat" | "lng" | "address" | "locationVerified">, mode: "driving" | "walking" = "driving") {
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", destination: destinationOf(c), travelmode: mode })}`;
}

/** Apple Maps (iPhone mở thẳng app Bản đồ), xuất phát từ vị trí hiện tại. */
export function appleDirectionsUrl(c: Pick<CampusProfile, "lat" | "lng" | "address" | "locationVerified" | "name">) {
  return `https://maps.apple.com/?${new URLSearchParams({ daddr: destinationOf(c), dirflg: "d", q: `TH EDU ${c.name}` })}`;
}

/** Xem vị trí (không chỉ đường) trên Google Maps. */
export function googlePlaceUrl(c: Pick<CampusProfile, "lat" | "lng" | "address" | "locationVerified" | "googleMapsUrl">) {
  return c.googleMapsUrl ?? `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: destinationOf(c) })}`;
}

export const telHref = (phone: string) => `tel:${phone.replace(/^\+84/, "0").replace(/\s/g, "")}`;
export const displayPhone = (phone: string) => {
  const local = phone.replace(/^\+?84/, "0");
  return local.length === 10 ? `${local.slice(0, 4)}.${local.slice(4, 7)}.${local.slice(7)}` : local;
};

// ----------------------------------------------------------------------------- Đọc toạ độ từ link Google Maps

/**
 * Lấy toạ độ từ link Google Maps quản trị viên dán vào (bản đầy đủ, mở trên máy tính):
 *  …/place/…/@20.96,105.79,17z/data=…!3d20.9641!4d105.7911  → ưu tiên !3d!4d (đúng vị trí ghim), sau đó @lat,lng, ?q=lat,lng.
 * Link rút gọn (maps.app.goo.gl) không chứa toạ độ → trả null (mở link trên máy tính, copy link đầy đủ).
 */
export function parseGoogleMapsCoords(url: string): { lat: number; lng: number } | null {
  const valid = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const pin = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (pin && valid(+pin[1]!, +pin[2]!)) return { lat: +pin[1]!, lng: +pin[2]! };
  const at = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at && valid(+at[1]!, +at[2]!)) return { lat: +at[1]!, lng: +at[2]! };
  const q = url.match(/[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i);
  if (q && valid(+q[1]!, +q[2]!)) return { lat: +q[1]!, lng: +q[2]! };
  return null;
}
