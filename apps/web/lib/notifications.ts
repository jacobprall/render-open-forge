export type NotificationType =
  | "agent_needs_input"
  | "ci_failed"
  | "pr_merged"
  | "review_requested"
  | "escalation";

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: Date;
}
