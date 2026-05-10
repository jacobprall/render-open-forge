"use client";

import { useState, useCallback, useTransition } from "react";
import useSWR from "swr";
import { Building2, Save, Users } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";

interface Org {
  id: string;
  name: string;
  slug: string;
}

interface OrgMember {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  isAdmin: boolean;
  createdAt: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load");
  return res.json();
};

export default function OrganizationPage() {
  const { data: org, mutate: mutateOrg, isLoading: orgLoading } = useSWR<Org>("/api/org", fetcher);
  const { data: members, isLoading: membersLoading } = useSWR<OrgMember[]>("/api/org/members", fetcher);

  const [name, setName] = useState(org?.name ?? "");
  const [saving, startSaving] = useTransition();
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(() => {
    if (!name.trim()) return;
    startSaving(async () => {
      await apiFetch("/api/org", {
        method: "PATCH",
        body: { name: name.trim() },
      });
      setSaved(true);
      mutateOrg();
      setTimeout(() => setSaved(false), 2000);
    });
  }, [name, mutateOrg]);

  if (orgLoading || !org) {
    return (
      <div className="flex items-center justify-center py-20 text-text-tertiary">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-6 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">Organization</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">
              Organization Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full max-w-md border border-stroke-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      <div>
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">Members</h2>
        </div>

        {membersLoading ? (
          <p className="text-sm text-text-tertiary">Loading members...</p>
        ) : !members || members.length === 0 ? (
          <p className="text-sm text-text-tertiary">No members found</p>
        ) : (
          <div className="border border-stroke-subtle">
            {members.map((member, i) => (
              <div
                key={member.id}
                className={`flex items-center justify-between px-4 py-3 ${
                  i > 0 ? "border-t border-stroke-subtle" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  {member.image ? (
                    <img
                      src={member.image}
                      alt=""
                      className="h-8 w-8 bg-surface-3"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center bg-surface-3 text-xs font-medium text-text-secondary">
                      {(member.name ?? member.email ?? "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-medium text-text-primary">
                      {member.name ?? "Unnamed"}
                    </div>
                    {member.email && (
                      <div className="text-xs text-text-tertiary">{member.email}</div>
                    )}
                  </div>
                </div>
                <span
                  className={`text-xs font-medium uppercase tracking-wider ${
                    member.isAdmin ? "text-accent" : "text-text-tertiary"
                  }`}
                >
                  {member.isAdmin ? "Admin" : "Member"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
