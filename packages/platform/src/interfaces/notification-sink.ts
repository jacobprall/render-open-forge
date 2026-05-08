/**
 * Pluggable notification sink.
 *
 * Services emit notification events; sinks deliver them to users
 * through various channels (console, webhook, email, Slack, etc.).
 * Multiple sinks can be composed via CompositeSink.
 */

export type NotificationLevel = "info" | "warning" | "error";

export interface NotificationPayload {
  level: NotificationLevel;
  title: string;
  body: string;
  /** URL linking to the relevant resource (session, PR, CI run). */
  url?: string;
  /** Structured metadata for downstream processing. */
  metadata?: Record<string, unknown>;
}

export interface NotificationSink {
  send(userId: string, payload: NotificationPayload): Promise<void>;
}

// ---------------------------------------------------------------------------
// Console implementation (development / debugging)
// ---------------------------------------------------------------------------

export class ConsoleSink implements NotificationSink {
  async send(userId: string, payload: NotificationPayload): Promise<void> {
    const prefix =
      payload.level === "error"
        ? "❌"
        : payload.level === "warning"
          ? "⚠️"
          : "ℹ️";
    console.log(
      `[notification] ${prefix} user=${userId} ${payload.title}: ${payload.body}${payload.url ? ` (${payload.url})` : ""}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Webhook implementation (POST JSON to a configured URL)
// ---------------------------------------------------------------------------

export class WebhookSink implements NotificationSink {
  constructor(
    private webhookUrl: string,
    private headers?: Record<string, string>,
  ) {}

  async send(userId: string, payload: NotificationPayload): Promise<void> {
    try {
      await fetch(this.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.headers,
        },
        body: JSON.stringify({ userId, ...payload }),
      });
    } catch (err) {
      console.error(
        `[webhook-sink] Failed to deliver notification to ${this.webhookUrl}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Composite: fan-out to multiple sinks
// ---------------------------------------------------------------------------

export class CompositeSink implements NotificationSink {
  constructor(private sinks: NotificationSink[]) {}

  async send(userId: string, payload: NotificationPayload): Promise<void> {
    await Promise.allSettled(
      this.sinks.map((s) => s.send(userId, payload)),
    );
  }
}

// ---------------------------------------------------------------------------
// No-op implementation (for tests)
// ---------------------------------------------------------------------------

export class NoopSink implements NotificationSink {
  public sent: Array<{ userId: string; payload: NotificationPayload }> = [];

  async send(userId: string, payload: NotificationPayload): Promise<void> {
    this.sent.push({ userId, payload });
  }
}
