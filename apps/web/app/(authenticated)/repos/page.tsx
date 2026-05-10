import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { createForgeProvider } from "@/lib/forge/client";
import Link from "next/link";
import type { ForgeRepo } from "@openforge/platform/forge/types";
import {
  PageShell,
  EmptyState,
  Button,
} from "@/components/primitives";
import { FolderOpen, Plus } from "lucide-react";
import { RepoTable } from "./repo-table";

export const metadata: Metadata = { title: "Repos" };

export default async function ReposPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const forge = createForgeProvider(session.forgeToken, session.forgeType);
  const repos = await forge.repos.list().catch(() => [] as ForgeRepo[]);

  const description = `${repos.length} ${repos.length === 1 ? "repository" : "repositories"}`;

  return (
    <PageShell
      title="Repos"
      description={description}
      className="mx-auto max-w-5xl"
      actions={
        <Button variant="primary" asChild>
          <Link href="/repos/new">
            <Plus className="h-4 w-4" />
            New Repository
          </Link>
        </Button>
      }
    >
      {repos.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-6 w-6" />}
          title="No repositories yet"
          description="Create your first repository to start hosting code."
          action={
            <Button variant="primary" asChild>
              <Link href="/repos/new">
                <Plus className="h-4 w-4" />
                New Repository
              </Link>
            </Button>
          }
        />
      ) : (
        <RepoTable data={repos} />
      )}
    </PageShell>
  );
}
