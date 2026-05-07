import type { SessionPhase } from "../types";

export type PhaseTransition = {
  from: SessionPhase;
  to: SessionPhase;
  condition: string;
};

export const AUTO_TRANSITIONS: PhaseTransition[] = [
  { from: "execute", to: "verify", condition: "execution completed and verify checks configured" },
  { from: "verify", to: "deliver", condition: "all verification checks passed" },
  { from: "deliver", to: "complete", condition: "PR merged" },
];

export function nextPhase(current: SessionPhase, verifyChecksConfigured: boolean): SessionPhase | null {
  if (current === "execute" && verifyChecksConfigured) return "verify";
  if (current === "verify") return "deliver";
  if (current === "deliver") return "complete";
  return null;
}

export function shouldAutoTransition(phase: SessionPhase, projectConfig: Record<string, unknown> | null): boolean {
  if (phase === "execute") {
    const checks = projectConfig?.verifyChecks;
    return Array.isArray(checks) && checks.length > 0;
  }
  if (phase === "verify") return true;
  return false;
}
