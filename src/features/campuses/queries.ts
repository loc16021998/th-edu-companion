import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { CAMPUS_ORDER, DEFAULT_CAMPUSES, type Campus, type CampusContact, type CampusProfile } from "@/config/campuses";

const isMissing = (code: string) => ["PGRST205", "PGRST202", "42P01", "42703"].includes(code);

function toContacts(json: unknown): CampusContact[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((c): c is { name: string; phone: string } => !!c && typeof c === "object" && typeof c.name === "string" && typeof c.phone === "string")
    .map(({ name, phone }) => ({ name, phone }));
}

/** Hồ sơ 2 cơ sở (bảng campus_profiles; chưa chạy apply-campuses.sql → dữ liệu mặc định trong config/campuses.ts). */
export const getCampusProfiles = cache(async (): Promise<{ available: boolean; campuses: CampusProfile[] }> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campus_profiles")
    .select("campus, name, address, lat, lng, location_verified, google_maps_url, contacts, opening_hours, photo_url");
  if (error) {
    if (!isMissing(error.code)) console.error("[campuses] Không tải được hồ sơ cơ sở:", error);
    return { available: false, campuses: CAMPUS_ORDER.map((c) => DEFAULT_CAMPUSES[c]) };
  }
  const byCampus = new Map(data.map((r) => [r.campus, r]));
  return {
    available: true,
    campuses: CAMPUS_ORDER.map((c): CampusProfile => {
      const r = byCampus.get(c);
      if (!r) return DEFAULT_CAMPUSES[c];
      return {
        campus: c,
        name: r.name,
        short: DEFAULT_CAMPUSES[c].short,
        address: r.address,
        lat: r.lat,
        lng: r.lng,
        locationVerified: r.location_verified,
        googleMapsUrl: r.google_maps_url,
        contacts: toContacts(r.contacts),
        openingHours: r.opening_hours,
        photoUrl: r.photo_url,
      };
    }),
  };
});

const REQUEST_COLUMNS =
  "id, student_id, from_campus, to_campus, reason, distance_from_km, distance_to_km, status, admin_note, new_class_name, decided_at, created_at";

/** Đơn chuyển cơ sở của các bé (phụ huynh — RLS chỉ trả đơn của chính mình). */
export async function listMyTransferRequests(studentIds: string[]) {
  if (studentIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("campus_transfer_requests").select(REQUEST_COLUMNS).in("student_id", studentIds).order("created_at", { ascending: false }).limit(20);
  if (error) {
    if (!isMissing(error.code)) console.error("[campuses] Không tải được đơn chuyển cơ sở:", error);
    return [];
  }
  return data;
}

export type TransferRequest = Awaited<ReturnType<typeof listMyTransferRequests>>[number];

/** Quản trị viên: đơn đang chờ + 60 ngày gần đây. */
export async function listAllTransferRequests() {
  const supabase = await createClient();
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("campus_transfer_requests")
    .select(`${REQUEST_COLUMNS}, student:students(full_name, class_name, campus), parent:profiles!campus_transfer_requests_parent_id_fkey(full_name, phone)`)
    .or(`status.eq.pending,created_at.gte.${since}`)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    if (isMissing(error.code)) return { available: false as const, items: [] };
    throw new Error("Không tải được đơn chuyển cơ sở", { cause: error });
  }
  return { available: true as const, items: data };
}

export type AdminTransferRequest = Awaited<ReturnType<typeof listAllTransferRequests>>["items"][number];

export type { Campus };
