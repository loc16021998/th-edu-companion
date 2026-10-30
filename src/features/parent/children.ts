import "server-only";
import { cookies } from "next/headers";
import { getAuthContext } from "@/features/auth/queries";
import { listStudents } from "@/features/students/queries";
import { cacheEnabled, listParentChildrenCached } from "./cached";
import { SELECTED_CHILD_COOKIE, pickChild } from "./selected-child";

/**
 * Danh sách con của phụ huynh và bé đang được chọn: ?child= trên URL → bé đã chọn lần trước (cookie) → bé đầu tiên.
 * id không thuộc phụ huynh → bỏ qua (danh sách chỉ gồm con của phụ huynh đã xác thực).
 * Phụ huynh: đọc từ cache (làm mới khi admin thêm / sửa học sinh); vai trò khác: RLS như cũ.
 */
export async function getSelectedChild(childParam: string | string[] | undefined) {
  const ctx = await getAuthContext();
  const students = ctx?.profile.role === "parent" && cacheEnabled() ? await listParentChildrenCached(ctx.profile.id) : await listStudents();
  const fromUrl = typeof childParam === "string" ? childParam : undefined;
  const fromCookie = (await cookies()).get(SELECTED_CHILD_COOKIE)?.value;
  const child = pickChild(students, fromUrl, fromCookie);
  return { students, child };
}

/** Tạo href giữ nguyên bé đang chọn (chỉ khi phụ huynh có nhiều con). */
export function childHref(
  path: string,
  childId: string | undefined,
  params: Record<string, string | undefined> = {},
) {
  const search = new URLSearchParams();
  if (childId) search.set("child", childId);
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}
