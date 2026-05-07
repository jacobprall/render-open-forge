import type { CiEvent } from "@render-open-forge/db"
import type { UserSession } from "@/lib/auth/session"

export interface EscalationNotification {
  id: string
  sessionId: string
  userId: number
  username: string
  type: "ci_escalation"
  title: string
  message: string
  ciEventId: string
  workflowName: string | null
  createdAt: Date
}

/**
 * Returns true when the session has exhausted its CI fix attempts,
 * meaning the agent should stop retrying and escalate to a human.
 *
 * `session` must include ciFixAttempts and maxCiFixAttempts fields.
 */
export function shouldEscalate(
  session: { ciFixAttempts: number; maxCiFixAttempts: number },
  ciEvent: Pick<CiEvent, "type">,
): boolean {
  if (ciEvent.type !== "ci_failure") return false
  return session.ciFixAttempts >= session.maxCiFixAttempts
}

/**
 * Creates an in-memory escalation notification record.
 * This can later be persisted to a notifications table or
 * sent through an external channel (email, Slack, etc.).
 */
export function createEscalationNotification(
  session: UserSession & { ciFixAttempts: number; maxCiFixAttempts: number },
  ciEvent: Pick<CiEvent, "id" | "sessionId" | "type" | "workflowName">,
): EscalationNotification {
  return {
    id: crypto.randomUUID(),
    sessionId: ciEvent.sessionId,
    userId: session.userId,
    username: session.username,
    type: "ci_escalation",
    title: `CI fix limit reached for ${ciEvent.workflowName ?? "workflow"}`,
    message: [
      `The agent has attempted ${session.ciFixAttempts} CI fixes (max: ${session.maxCiFixAttempts}).`,
      `Workflow "${ciEvent.workflowName ?? "unknown"}" continues to fail.`,
      `Manual intervention is required.`,
    ].join(" "),
    ciEventId: ciEvent.id,
    workflowName: ciEvent.workflowName,
    createdAt: new Date(),
  }
}
