import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { createForgeProvider } from "@/lib/forge/client";
import Link from "next/link";
import { Select } from "@/components/primitives/select";

export const metadata: Metadata = { title: "New Repository" };

async function createRepository(formData: FormData) {
  "use server";

  const session = await getSession();
  if (!session) redirect("/");

  const name = formData.get("name") as string;
  const description = (formData.get("description") as string) || undefined;
  const isPrivate = formData.get("private") === "on";
  const autoInit = formData.get("auto_init") === "on";
  const defaultBranch =
    (formData.get("default_branch") as string) || "main";

  if (!name || !/^[a-zA-Z0-9_.-]+$/.test(name)) {
    redirect("/repos/new?error=invalid_name");
  }

  const forge = createForgeProvider(session.forgeToken, session.forgeType);

  let repoFullName: string;
  try {
    const repo = await forge.repos.create({
      name,
      description,
      isPrivate,
      autoInit,
      defaultBranch,
    });
    repoFullName = repo.fullName;
  } catch (err) {
    console.error("[repos/new] create failed:", err);
    redirect("/repos/new?error=create_failed");
  }

  redirect(`/${repoFullName}`);
}

export default async function NewRepoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const { error } = await searchParams;

  const errorMessage =
    error === "invalid_name"
      ? "Repository name must contain only letters, numbers, hyphens, underscores, and dots."
      : error === "create_failed"
        ? "Failed to create repository. It may already exist or the name is reserved."
        : null;

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/repos"
          className="mb-4 inline-flex items-center gap-1 text-sm text-text-tertiary transition-colors duration-(--of-duration-instant) hover:text-text-primary"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
            />
          </svg>
          Back to repositories
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">
          Create a new repository
        </h1>
        <p className="mt-1 text-sm text-text-tertiary">
          A repository contains all project files, including the revision
          history.
        </p>
      </div>

      {/* Error */}
      {errorMessage && (
        <div className="mb-6 flex items-start gap-3 border border-danger/20 bg-danger/10 px-4 py-3">
          <svg
            className="mt-0.5 h-4 w-4 shrink-0 text-danger"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
            />
          </svg>
          <p className="text-sm text-danger">{errorMessage}</p>
        </div>
      )}

      {/* Form */}
      <form action={createRepository} className="space-y-6">
        {/* Owner / Name */}
        <div>
          <label
            htmlFor="name"
            className="mb-2 block text-sm font-medium text-text-primary"
          >
            Repository name <span className="text-danger">*</span>
          </label>
          <div className="flex items-center gap-2">
            <span className="border border-stroke-subtle bg-surface-1 px-3 py-2 text-sm text-text-tertiary">
              {session.username}
            </span>
            <span className="text-text-tertiary">/</span>
            <input
              id="name"
              name="name"
              type="text"
              required
              pattern="[a-zA-Z0-9_.\-]+"
              placeholder="my-project"
              className="flex-1 border border-stroke-subtle bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder-text-tertiary outline-none transition-colors duration-(--of-duration-instant) focus:border-accent/50 focus:ring-1 focus:ring-accent/25"
            />
          </div>
          <p className="mt-1.5 text-xs text-text-tertiary">
            Use letters, numbers, hyphens, underscores, or dots.
          </p>
        </div>

        {/* Description */}
        <div>
          <label
            htmlFor="description"
            className="mb-2 block text-sm font-medium text-text-primary"
          >
            Description{" "}
            <span className="font-normal text-text-tertiary">(optional)</span>
          </label>
          <input
            id="description"
            name="description"
            type="text"
            placeholder="A short description of your repository"
            className="w-full border border-stroke-subtle bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder-text-tertiary outline-none transition-colors duration-(--of-duration-instant) focus:border-accent/50 focus:ring-1 focus:ring-accent/25"
          />
        </div>

        <hr className="border-stroke-subtle" />

        {/* Default branch */}
        <div>
          <label
            htmlFor="default_branch"
            className="mb-2 block text-sm font-medium text-text-primary"
          >
            Default branch
          </label>
          <Select
            name="default_branch"
            defaultValue="main"
            options={[
              { value: "main", label: "main" },
              { value: "master", label: "master" },
              { value: "develop", label: "develop" },
            ]}
          />
        </div>

        {/* Visibility */}
        <div>
          <span className="mb-3 block text-sm font-medium text-text-primary">
            Visibility
          </span>
          <label className="flex cursor-pointer items-start gap-3 border border-stroke-subtle bg-surface-1 p-4 transition-colors duration-(--of-duration-instant) hover:border-stroke-default">
            <input
              type="checkbox"
              name="private"
              className="mt-0.5 h-4 w-4 rounded border-stroke-default bg-surface-2 text-accent-text focus:ring-accent/25"
            />
            <div>
              <div className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 text-text-tertiary"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                  />
                </svg>
                <span className="text-sm font-medium text-text-primary">
                  Private repository
                </span>
              </div>
              <p className="mt-1 text-xs text-text-tertiary">
                Only you and collaborators you invite can see this repository.
              </p>
            </div>
          </label>
        </div>

        {/* Auto-init */}
        <div>
          <span className="mb-3 block text-sm font-medium text-text-primary">
            Initialize repository
          </span>
          <label className="flex cursor-pointer items-start gap-3 border border-stroke-subtle bg-surface-1 p-4 transition-colors duration-(--of-duration-instant) hover:border-stroke-default">
            <input
              type="checkbox"
              name="auto_init"
              defaultChecked
              className="mt-0.5 h-4 w-4 rounded border-stroke-default bg-surface-2 text-accent-text focus:ring-accent/25"
            />
            <div>
              <div className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 text-text-tertiary"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                  />
                </svg>
                <span className="text-sm font-medium text-text-primary">
                  Add a README file
                </span>
              </div>
              <p className="mt-1 text-xs text-text-tertiary">
                Initialize the repository with a README so you can start
                working immediately.
              </p>
            </div>
          </label>
        </div>

        <hr className="border-stroke-subtle" />

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Link
            href="/repos"
            className="border border-stroke-subtle px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors duration-(--of-duration-instant) hover:border-stroke-default hover:bg-surface-1"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="inline-flex items-center gap-2 bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors duration-(--of-duration-instant) hover:bg-accent-hover"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            Create repository
          </button>
        </div>
      </form>
    </div>
  );
}
