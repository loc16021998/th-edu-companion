import type { Metadata } from "next";
import { ChatPage } from "@/features/chat/screens/chat-page";

export const metadata: Metadata = { title: "Nhắn tin" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  return <ChatPage params={await searchParams} basePath="/parent/chat" />;
}
