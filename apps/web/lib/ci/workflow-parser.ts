import YAML from "yaml";

export interface ParsedStep {
  name?: string;
  run: string;
  env?: Record<string, string>;
}

export interface ParsedJob {
  name: string;
  steps: ParsedStep[];
  runsOn?: string;
}

export interface ParsedWorkflow {
  name: string;
  triggers: WorkflowTriggers;
  jobs: ParsedJob[];
}

export interface WorkflowTriggers {
  push?: { branches?: string[] };
  pullRequest?: { branches?: string[] };
}

/**
 * Parse a Forgejo/GitHub Actions workflow YAML into a simplified structure.
 * Only `run:` steps are extracted — `uses:` action references are skipped
 * since we execute steps directly rather than through an Actions runner.
 */
export function parseWorkflowYaml(content: string, filename: string): ParsedWorkflow | null {
  let doc: Record<string, unknown>;
  try {
    doc = YAML.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (!doc || typeof doc !== "object") return null;

  const name = typeof doc.name === "string" ? doc.name : filename;
  const triggers = parseTriggers(doc.on);
  const rawJobs = doc.jobs as Record<string, unknown> | undefined;
  if (!rawJobs || typeof rawJobs !== "object") return null;

  const jobs: ParsedJob[] = [];
  for (const [jobId, jobDef] of Object.entries(rawJobs)) {
    if (!jobDef || typeof jobDef !== "object") continue;
    const j = jobDef as Record<string, unknown>;
    const rawSteps = j.steps as unknown[] | undefined;
    if (!Array.isArray(rawSteps)) continue;

    const steps: ParsedStep[] = [];
    for (const rawStep of rawSteps) {
      if (!rawStep || typeof rawStep !== "object") continue;
      const s = rawStep as Record<string, unknown>;

      if (typeof s.run === "string") {
        steps.push({
          name: typeof s.name === "string" ? s.name : undefined,
          run: s.run,
          env: isStringRecord(s.env) ? s.env : undefined,
        });
      }
      // `uses:` steps are intentionally skipped — we don't support Actions marketplace
    }

    if (steps.length > 0) {
      jobs.push({
        name: typeof j.name === "string" ? j.name : jobId,
        steps,
        runsOn: typeof j["runs-on"] === "string" ? j["runs-on"] : undefined,
      });
    }
  }

  if (jobs.length === 0) return null;

  return { name, triggers, jobs };
}

function parseTriggers(on: unknown): WorkflowTriggers {
  const result: WorkflowTriggers = {};

  if (on === undefined || on === null) return result;

  // Invalid / ambiguous workflow trigger (e.g. YAML `on: true`)
  if (typeof on === "boolean") return result;

  // `on: push` or `on: [push, pull_request]`
  if (typeof on === "string") {
    if (on === "push") result.push = {};
    if (on === "pull_request") result.pullRequest = {};
    return result;
  }

  if (Array.isArray(on)) {
    for (const t of on) {
      if (t === "push") result.push = {};
      if (t === "pull_request") result.pullRequest = {};
    }
    return result;
  }

  if (typeof on === "object") {
    const o = on as Record<string, unknown>;
    if ("push" in o) {
      result.push = parseBranchFilter(o.push);
    }
    if ("pull_request" in o) {
      result.pullRequest = parseBranchFilter(o.pull_request);
    }
  }

  return result;
}

function parseBranchFilter(val: unknown): { branches?: string[] } {
  if (val === null || val === undefined) return {};
  if (typeof val !== "object") return {};
  const v = val as Record<string, unknown>;
  const branches = v.branches;
  if (Array.isArray(branches)) {
    return { branches: branches.filter((b): b is string => typeof b === "string") };
  }
  return {};
}

/**
 * Check whether a workflow should trigger for a given event.
 */
export function shouldTrigger(
  workflow: ParsedWorkflow,
  event: "push" | "pull_request",
  branch: string,
): boolean {
  const trigger = event === "push" ? workflow.triggers.push : workflow.triggers.pullRequest;
  if (!trigger) return false;

  if (!trigger.branches || trigger.branches.length === 0) return true;

  return trigger.branches.some((pattern) => {
    if (pattern === branch) return true;
    if (pattern === "*") return true;
    if (pattern.endsWith("*") && branch.startsWith(pattern.slice(0, -1))) return true;
    return false;
  });
}

function isStringRecord(v: unknown): v is Record<string, string> {
  if (!v || typeof v !== "object") return false;
  return Object.values(v as Record<string, unknown>).every((val) => typeof val === "string");
}
