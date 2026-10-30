import { redirect } from "next/navigation";
import { getAuthContext } from "@/features/auth/queries";
import { LOGIN_PATH } from "@/lib/auth/routes";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** /chat → kênh chat theo vai trò (giữ ?with=). */
export default async function ChatRedirect({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect(`${LOGIN_PATH}?next=/chat`);
  const withId = (await searchParams).with;
  const qs = typeof withId === "string" ? `?with=${encodeURIComponent(withId)}` : "";
  if (ctx.profile.role === "teacher") redirect(`/teacher/chat${qs}`);
  if (ctx.profile.role === "parent") redirect(`/parent/chat${qs}`);
  redirect("/admin/dashboard");
}
