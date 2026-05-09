"use client";

import { useParams } from "next/navigation";
import { MembersList } from "./members-list";

export default function OrgMembersPage() {
  const params = useParams<{ org: string }>();
  const org = params.org;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-2 text-2xl font-bold text-text-primary">Team Management</h1>
      <p className="mb-6 text-sm text-text-tertiary">
        Manage members of <span className="font-medium text-text-primary">{org}</span>
      </p>
      <MembersList org={org} />
    </div>
  );
}
