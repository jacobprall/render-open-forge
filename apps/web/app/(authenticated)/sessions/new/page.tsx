import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getUserPreferences } from "@/lib/db/loaders";
import { NewChatView } from "./new-chat-view";

export const metadata: Metadata = { title: "New Chat" };

export default async function NewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ repo?: string; branch?: string; project?: string }>;
}) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  if (!session) redirect("/");

  const userId = String(session.userId);
  const prefsRow = await getUserPreferences(userId);
  const defaultModelId = prefsRow?.data?.defaultModelId ?? undefined;

  return (
    <NewChatView
      defaultModelId={defaultModelId}
      defaultRepo={params.repo}
      defaultBranch={params.branch}
      projectId={params.project}
    />
  );
}
