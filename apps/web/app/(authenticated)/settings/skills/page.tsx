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
        <h2 className="text-lg font-semibold text-zinc-100">Skills</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Personal skills live in your{" "}
          <span className="font-mono text-zinc-300">{FORGE_SKILLS_REPO_NAME}</span> repository
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
            <p className="mt-1 text-xs text-zinc-600">
              If this link returns a 404, revisit this page to trigger repo creation.
            </p>
          </>
        ) : null}
      </div>

      {/* Install from URL */}
      <InstallSkillForm />

      <section>
        <h3 className="mb-3 text-sm font-medium text-zinc-300">Your skills</h3>
        {userSkills.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No custom skills yet. Install one from a URL above, or add markdown
            files in your skills repo.
          </p>
        ) : (
          <ul className="space-y-2">
            {userSkills.map((s) => (
              <li
                key={`${s.source}-${s.slug}`}
                className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 transition hover:border-zinc-700"
              >
                <div className="text-sm font-medium text-zinc-200">{s.name}</div>
                <div className="text-xs text-zinc-500">{s.description}</div>
                <div className="mt-1 font-mono text-[10px] text-zinc-600">skills/{s.slug}.md</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-sm font-medium text-zinc-300">Built-in skills</h3>
        <p className="mb-3 text-xs text-zinc-500">
          Included by default. Copies are seeded into your personal repo on first visit.
        </p>
        <ul className="space-y-2">
          {builtins.map((s) => (
            <li
              key={s.slug}
              className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2 transition hover:border-zinc-700"
            >
              <div className="text-sm font-medium text-zinc-300">{s.name}</div>
              <div className="text-xs text-zinc-500">{s.description}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-3 text-sm text-zinc-400">
        <p>
          Repository-specific skills: add markdown files under{" "}
          <span className="font-mono text-zinc-300">.forge/skills/*.md</span> in the target repository.
        </p>
        <Link href="/sessions/new" className="mt-2 inline-block text-accent-text hover:text-accent">
          New session
        </Link>
      </section>
    </div>
  );
}
