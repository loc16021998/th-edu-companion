import type { Metadata } from "next";
import { todayVN } from "@/lib/date";
import { DEFAULT_SHIFT } from "@/lib/shifts";
import { getSelectedChild } from "@/features/parent/children";
import { getClassShift } from "@/features/shifts/queries";
import { getCampusProfiles, listMyTransferRequests } from "@/features/campuses/queries";
import { PickupWidget } from "@/features/campuses/components/pickup-widget";
import { CampusesExplorer } from "@/features/campuses/components/campuses-explorer";

export const metadata: Metadata = { title: "Cơ sở & đưa đón" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ParentCampusesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { students, child } = await getSelectedChild(params.child);
  const [{ campuses }, shift, requests] = await Promise.all([
    getCampusProfiles(),
    child ? getClassShift(child.campus, child.class_name) : null,
    listMyTransferRequests(students.map((s) => s.id)),
  ]);
  const childCampus = child ? campuses.find((c) => c.campus === child.campus) : undefined;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold">Cơ sở & đưa đón</h1>
        <p className="text-sm text-muted-foreground">2 cơ sở TH EDU tại Hà Đông · chạm vào biểu tượng trên bản đồ để xem chi tiết.</p>
      </div>
      {child && childCampus && (
        <PickupWidget childName={child.full_name} className={child.class_name} campus={childCampus} shift={shift?.is_active ? shift : DEFAULT_SHIFT} today={todayVN()} />
      )}
      <CampusesExplorer
        campuses={campuses}
        kids={students.map((s) => ({ id: s.id, full_name: s.full_name, campus: s.campus, class_name: s.class_name }))}
        selectedChildId={child?.id ?? null}
        requests={requests}
      />
    </div>
  );
}
