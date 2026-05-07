"use client";

import { useState } from "react";
import useSWR from "swr";
import { Building2 } from "lucide-react";
import {
  PageShell,
  Input,
  FormField,
  Button,
  Avatar,
  EmptyState,
  ListRow,
} from "@/components/primitives";

interface Org {
  id: number;
  username: string;
  full_name: string;
  avatar_url: string;
  description: string;
}

async function orgsFetcher(url: string): Promise<Org[]> {
  const res = await fetch(url);
  if (!res.ok) return [];
  return res.json() as Promise<Org[]>;
}

export default function OrgsPage() {
  const { data: orgs = [], isLoading: loading, mutate } = useSWR("/api/orgs", orgsFetcher, {
    revalidateOnFocus: true,
  });
  const [login, setLogin] = useState("");
  const [fullName, setFullName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!login.trim()) return;

    setCreating(true);
    setError(null);
    const res = await fetch("/api/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login: login.trim(),
        fullName: fullName.trim() || undefined,
        description: description.trim() || undefined,
      }),
    });

    if (res.ok) {
      setLogin("");
      setFullName("");
      setDescription("");
      await mutate();
    } else {
      const data = await res.json().catch(() => ({}));
      setError((data as { error?: string }).error || "Failed to create organization");
    }
    setCreating(false);
  }

  return (
    <PageShell title="Organizations" narrow>
      <form
        onSubmit={handleCreate}
        className="mb-8 rounded-lg border border-stroke-default bg-surface-1 p-4"
      >
        <h2 className="mb-4 text-lg font-medium text-text-primary">Create Organization</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Login" required>
            <Input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="my-org"
            />
          </FormField>
          <FormField label="Full Name">
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="My Organization"
            />
          </FormField>
          <FormField label="Description" className="sm:col-span-2">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </FormField>
        </div>
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
        <Button
          type="submit"
          variant="primary"
          loading={creating}
          disabled={!login.trim()}
          className="mt-4"
        >
          Create Organization
        </Button>
      </form>

      {loading ? (
        <p className="text-sm text-text-secondary">Loading organizations...</p>
      ) : orgs.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-6 w-6" />}
          title="No organizations yet"
          description="Create one above to get started."
        />
      ) : (
        <div className="space-y-3">
          {orgs.map((org) => (
            <ListRow
              key={org.id}
              icon={
                <Avatar
                  src={org.avatar_url}
                  alt={org.username}
                  fallback={org.full_name || org.username}
                  size="lg"
                />
              }
              title={org.full_name || org.username}
              subtitle={
                <>
                  @{org.username}
                  {org.description ? (
                    <span className="text-text-tertiary"> &mdash; {org.description}</span>
                  ) : null}
                </>
              }
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}
