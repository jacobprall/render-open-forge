import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forge/client";
import {
  ensureUserSkillsRepo,
  FORGE_SKILLS_REPO_NAME,
  listBuiltinSummaries,
  listUserSkillSummaries,
} from "@openforge/skills";
import { InstallSkillForm } from "./install-skill-form";

export const metadata: Metadata = { title: "Skills" };

export default async function SkillsSettingsPage() {
  const auth = await getSession();
  if (!auth) redirect("/");

  const forge = createForgeProvider(auth.forgeToken, auth.forgeType);

  try {
    await ensureUserSkillsRepo(forge, auth.username);
  } catch {
    // Seeding may fail on first visit; the repo itself should still exist.
  }

  const builtins = listBuiltinSummaries();
  let userSkills: Awaited<ReturnType<typeof listUserSkillSummaries>> = [];
  try {
    userSkills = await listUserSkillSummaries(forge, auth.username);
  } catch {
    // Repo may not exist yet — show empty list.
  }

  const base =
    process.env.FORGEJO_EXTERNAL_URL ||
    process.env.FORGEJO_INTERNAL_URL ||
    "";
  const repoWebUrl = `${base.replace(/\/$/, "")}/${auth.username}/${FORGE_SKILLS_REPO_NAME}`;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Skills</h2>
        <p className="mt-1 text-sm text-text-tertiary">
          Personal skills live in your{" "}
          <span className="font-mono text-text-secondary">{FORGE_SKILLS_REPO_NAME}</span> repository
          as markdown with YAML frontmatter (under <span className="font-mono">skills/*.md</span>
          ). They are merged with built-in and per-repo skills when you start a session.
        </p>
        {base ? (
          <>
            <a
              href={repoWebUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-text hover:text-accent"
            >
              Open skills repo
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
            <p className="mt-1 text-xs text-text-tertiary">
              If this link returns a 404, revisit this page to trigger repo creation.
            </p>
          </>
        ) : null}
      </div>

      {/* Install from URL */}
      <InstallSkillForm />

      <section>
        <h3 className="mb-3 text-sm font-medium text-text-secondary">Your skills</h3>
        {userSkills.length === 0 ? (
          <p className="text-sm text-text-tertiary">
            No custom skills yet. Install one from a URL above, or add markdown
            files in your skills repo.
          </p>
        ) : (
          <ul className="space-y-2">
            {userSkills.map((s) => (
              <li
                key={`${s.source}-${s.slug}`}
                className="border border-stroke-subtle bg-surface-1 px-3 py-2 transition-colors duration-(--of-duration-instant) hover:border-stroke-default"
              >
                <div className="text-sm font-medium text-text-primary">{s.name}</div>
                <div className="text-xs text-text-tertiary">{s.description}</div>
                <div className="mt-1 font-mono text-[10px] text-text-tertiary">skills/{s.slug}.md</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-sm font-medium text-text-secondary">Built-in skills</h3>
        <p className="mb-3 text-xs text-text-tertiary">
          Included by default. Copies are seeded into your personal repo on first visit.
        </p>
        <ul className="space-y-2">
          {builtins.map((s) => (
            <li
              key={s.slug}
              className="border border-stroke-subtle bg-surface-0 px-3 py-2 transition-colors duration-(--of-duration-instant) hover:border-stroke-default"
            >
              <div className="text-sm font-medium text-text-secondary">{s.name}</div>
              <div className="text-xs text-text-tertiary">{s.description}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="border border-stroke-subtle bg-surface-1 px-4 py-3 text-sm text-text-tertiary">
        <p>
          Repository-specific skills: add markdown files under{" "}
          <span className="font-mono text-text-secondary">.forge/skills/*.md</span> in the target repository.
        </p>
        <Link href="/sessions" className="mt-2 inline-block text-accent-text hover:text-accent">
          New session
        </Link>
      </section>
    </div>
  );
}
