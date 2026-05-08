import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify Forgejo / Gitea webhook HMAC-SHA256 over the raw request body.
 * Compare `X-Forgejo-Signature` / `X-Gitea-Signature` (hex digest, optional sha256= prefix).
 */
export function verifyForgejoWebhookSignature(
  rawBody: string,
  forgejoSig: string | null | undefined,
  giteaSig: string | null | undefined,
  secret: string,
): boolean {
  const header = forgejoSig ?? giteaSig;
  if (!header) return false;

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const provided = header.replace(/^sha256=/i, "").trim().toLowerCase();

  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(provided, "hex");
    if (a.length !== b.length || a.length === 0) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function isForgejoWebhookVerificationConfigured(): boolean {
  return Boolean(process.env.FORGEJO_WEBHOOK_SECRET?.trim());
}

export function shouldAllowUnsignedForgejoWebhooks(): boolean {
  return process.env.FORGEJO_WEBHOOK_ALLOW_UNSIGNED === "true";
}
