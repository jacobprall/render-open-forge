"use client";

import { useParams } from "next/navigation";
import { MembersList } from "./members-list";

export default function OrgMembersPage() {
  const params = useParams<{ org: string }>();
  const org = params.org;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-2 text-2xl font-bold text-zinc-100">Team Management</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Manage members of <span className="font-medium text-zinc-200">{org}</span>
      </p>
      <MembersList org={org} />
    </div>
  );
}
