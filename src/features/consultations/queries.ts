import "server-only";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayVN } from "@/lib/date";
import { BOOKING_HORIZON_DAYS, audienceOf, modeOf, partyRoleOf, statusOf, type Audience, type BookingStatus, type ConsultMode, type PartyRole } from "./constants";
import type { Slot } from "./time";

const isMissing = (code: string) => ["PGRST205", "PGRST202", "42P01", "42703", "42883"].includes(code);

function logUnlessMissing(scope: string, error: { code: string }) {
  if (!isMissing(error.code)) console.error(`[consultations] ${scope}:`, error);
}

export type AvailabilityWindow = {
  id: string;
  hostId: string;
  weekday: number;
  start: string;
  end: string;
  slotMinutes: number;
  mode: ConsultMode;
  meetingUrl: string | null;
  location: string | null;
  audience: Audience;
  active: boolean;
};

export type Party = { id: string; name: string; role: PartyRole };

export type Booking = {
  id: string;
  host: Party;
  guest: Party;
  studentId: string | null;
  studentName: string;
  className: string;
  startsAt: string;
  endsAt: string;
  mode: ConsultMode;
  topic: string;
  status: BookingStatus;
  meetingUrl: string | null;
  location: string | null;
  hostNote: string | null;
  cancelReason: string | null;
  cancelledBy: string | null;
  /** Quản trị viên lên lịch trực tiếp (không qua đặt ô) */
  scheduledByAdmin: boolean;
  createdAt: string;
};

const WINDOW_COLUMNS = "id, host_id, weekday, start_time, end_time, slot_minutes, mode, meeting_url, location, audience, active";
const BOOKING_COLUMNS =
  "id, host_id, guest_id, student_id, starts_at, ends_at, mode, topic, status, meeting_url, location, host_note, cancel_reason, cancelled_by, created_by, created_at";

type WindowRow = { id: string; host_id: string; weekday: number; start_time: string; end_time: string; slot_minutes: number; mode: string; meeting_url: string | null; location: string | null; audience: string; active: boolean };
const toWindow = (w: WindowRow): AvailabilityWindow => ({
  id: w.id,
  hostId: w.host_id,
  weekday: w.weekday,
  start: w.start_time.slice(0, 5),
  end: w.end_time.slice(0, 5),
  slotMinutes: w.slot_minutes,
  mode: modeOf(w.mode),
  meetingUrl: w.meeting_url,
  location: w.location,
  audience: audienceOf(w.audience),
  active: w.active,
});

/** Khung giờ rảnh hằng tuần — của 1 người chủ trì, hoặc (quản trị viên, `hostId` bỏ trống) của tất cả. */
export async function listAvailability(hostId?: string): Promise<{ available: boolean; windows: AvailabilityWindow[] }> {
  const supabase = await createClient();
  let query = supabase.from("consultation_availability").select(WINDOW_COLUMNS).order("weekday").order("start_time");
  if (hostId) query = query.eq("host_id", hostId);
  const { data, error } = await query;
  if (error) {
    logUnlessMissing("Không tải được khung giờ", error);
    return { available: false, windows: [] };
  }
  return { available: true, windows: data.map(toWindow) };
}

type BookingRow = {
  id: string;
  host_id: string;
  guest_id: string;
  student_id: string | null;
  starts_at: string;
  ends_at: string;
  mode: string;
  topic: string;
  status: string;
  meeting_url: string | null;
  location: string | null;
  host_note: string | null;
  cancel_reason: string | null;
  cancelled_by: string | null;
  created_by: string | null;
  created_at: string;
};

/** Gắn tên 2 bên (RPC consultation_parties — chỉ lịch mình tham gia / quản trị viên) + tên bé. */
async function hydrate(rows: BookingRow[]): Promise<Booking[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const studentIds = [...new Set(rows.map((b) => b.student_id).filter((x): x is string => !!x))];
  const [parties, students] = await Promise.all([
    supabase.rpc("consultation_parties", { p_booking_ids: rows.map((b) => b.id) }),
    studentIds.length ? supabase.from("students").select("id, full_name, class_name").in("id", studentIds) : Promise.resolve({ data: [] as { id: string; full_name: string; class_name: string }[] }),
  ]);
  if (parties.error) logUnlessMissing("Không tải được tên người hẹn", parties.error);
  const partyOf = new Map((parties.data ?? []).map((p) => [p.booking_id, p]));
  const studentOf = new Map((students.data ?? []).map((s) => [s.id, s]));
  const fallbackName = (role: PartyRole) => (role === "admin" ? "Ban quản lý" : role === "teacher" ? "Giáo viên" : "Phụ huynh");

  return rows.map((b) => {
    const p = partyOf.get(b.id);
    const hostRole = partyRoleOf(p?.host_role ?? "teacher");
    const guestRole = partyRoleOf(p?.guest_role ?? "parent");
    const student = b.student_id ? studentOf.get(b.student_id) : undefined;
    return {
      id: b.id,
      host: { id: b.host_id, role: hostRole, name: p?.host_name ?? fallbackName(hostRole) },
      guest: { id: b.guest_id, role: guestRole, name: p?.guest_name ?? fallbackName(guestRole) },
      studentId: b.student_id,
      studentName: student?.full_name ?? "",
      className: student?.class_name ?? "",
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      mode: modeOf(b.mode),
      topic: b.topic,
      status: statusOf(b.status),
      meetingUrl: b.meeting_url,
      location: b.location,
      hostNote: b.host_note,
      cancelReason: b.cancel_reason,
      cancelledBy: b.cancelled_by,
      scheduledByAdmin: !!b.created_by && b.created_by !== b.guest_id && p?.creator_role === "admin",
      createdAt: b.created_at,
    };
  });
}

/**
 * Lịch hẹn mà người đang đăng nhập là người chủ trì hoặc khách (từ 14 ngày trước trở đi).
 * `studentIds`: phụ huynh — chỉ lịch về bé đang xem.
 */
export async function listMyBookings(me: { id: string }, opts: { studentIds?: string[] } = {}): Promise<{ available: boolean; bookings: Booking[] }> {
  const supabase = await createClient();
  let query = supabase
    .from("consultation_bookings")
    .select(BOOKING_COLUMNS)
    .or(`host_id.eq.${me.id},guest_id.eq.${me.id}`)
    .gte("starts_at", new Date(Date.now() - 14 * 86_400_000).toISOString())
    .order("starts_at")
    .limit(200);
  if (opts.studentIds?.length) query = query.in("student_id", opts.studentIds);
  const { data, error } = await query;
  if (error) {
    logUnlessMissing("Không tải được lịch hẹn", error);
    return { available: false, bookings: [] };
  }
  return { available: true, bookings: await hydrate(data) };
}

export type AdminBookingFilter = { from: string; to: string; status?: BookingStatus; hostId?: string };

/** Quản trị viên: mọi lịch hẹn trong khoảng ngày (giờ VN), lọc theo trạng thái / người chủ trì. */
export async function listAllBookings(f: AdminBookingFilter): Promise<{ available: boolean; bookings: Booking[] }> {
  const supabase = await createClient();
  let query = supabase
    .from("consultation_bookings")
    .select(BOOKING_COLUMNS)
    .gte("starts_at", new Date(`${f.from}T00:00:00+07:00`).toISOString())
    .lt("starts_at", new Date(`${addDays(f.to, 1)}T00:00:00+07:00`).toISOString())
    .order("starts_at")
    .limit(500);
  if (f.status) query = query.eq("status", f.status);
  if (f.hostId) query = query.eq("host_id", f.hostId);
  const { data, error } = await query;
  if (error) {
    logUnlessMissing("Không tải được lịch hẹn (quản trị)", error);
    return { available: false, bookings: [] };
  }
  return { available: true, bookings: await hydrate(data) };
}

export type BookingHost = { id: string; name: string; role: "teacher" | "admin"; hasAvailability: boolean };

/** Người khách được đặt lịch: phụ huynh (kèm bé) → cô chủ nhiệm + Ban quản lý; giáo viên → Ban quản lý. */
export async function listBookingHosts(studentId: string | null): Promise<{ available: boolean; hosts: BookingHost[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("consultation_hosts", { p_student_id: studentId });
  if (error) {
    logUnlessMissing("Không tải được người nhận lịch hẹn", error);
    return { available: false, hosts: [] };
  }
  return {
    available: true,
    hosts: (data ?? []).map((h) => ({ id: h.host_id, name: h.full_name, role: h.host_role === "admin" ? "admin" : "teacher", hasAvailability: h.has_availability })),
  };
}

/** Ô giờ của người chủ trì trong 3 tuần tới (chỉ khung người gọi được đặt; ô đã có người đặt → available = false). */
export async function listSlots(hostId: string): Promise<Slot[]> {
  const today = todayVN();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("consultation_slots", { p_host_id: hostId, p_from: today, p_to: addDays(today, BOOKING_HORIZON_DAYS - 1) });
  if (error) {
    logUnlessMissing("Không tải được khung giờ trống", error);
    return [];
  }
  return (data ?? []).map((s) => ({ startsAt: s.starts_at, endsAt: s.ends_at, mode: s.mode, available: s.available }));
}

/** Ô trống của nhiều người chủ trì (phụ huynh / giáo viên mở trang đặt lịch). */
export async function listSlotsFor(hosts: BookingHost[]): Promise<Record<string, Slot[]>> {
  const bookable = hosts.filter((h) => h.hasAvailability);
  const lists = await Promise.all(bookable.map((h) => listSlots(h.id)));
  return Object.fromEntries(bookable.map((h, i) => [h.id, lists[i] ?? []]));
}

export type Person = { id: string; name: string; role: "teacher" | "admin" | "parent"; children: { id: string; name: string; className: string }[] };

/** Quản trị viên: danh bạ để lên lịch — giáo viên, quản trị viên, phụ huynh (kèm các bé). */
export async function listSchedulingDirectory(): Promise<Person[]> {
  const supabase = await createClient();
  const [profiles, students] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role").in("role", ["teacher", "admin", "parent"]).order("full_name").limit(2000),
    supabase.from("students").select("id, full_name, class_name, parent_id").not("parent_id", "is", null).order("full_name").limit(3000),
  ]);
  if (profiles.error) {
    logUnlessMissing("Không tải được danh bạ", profiles.error);
    return [];
  }
  const kids = new Map<string, Person["children"]>();
  for (const s of students.data ?? []) {
    if (!s.parent_id) continue;
    kids.set(s.parent_id, [...(kids.get(s.parent_id) ?? []), { id: s.id, name: s.full_name, className: s.class_name }]);
  }
  return profiles.data.map((p) => ({ id: p.id, name: p.full_name, role: partyRoleOf(p.role), children: kids.get(p.id) ?? [] }));
}
