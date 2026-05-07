import { createHmac, randomBytes } from "crypto";

/**
 * Signed invite token utilities.
 *
 * Tokens are HMAC-SHA256 signed payloads: "{inviteId}:{expiresEpoch}:{sig}"
 * The signature prevents tampering without needing a database lookup first.
 * The database lookup still happens to check redemption/expiry — the
 * signature is a fast reject for invalid or forged tokens.
 */

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required for invite tokens");
  return secret;
}

export function createInviteToken(inviteId: string, expiresAt: Date): string {
  const expiresEpoch = Math.floor(expiresAt.getTime() / 1000);
  const payload = `${inviteId}:${expiresEpoch}`;
  const sig = createHmac("sha256", getSecret()).update(payload).digest("hex");
  return `${payload}:${sig}`;
}

interface ParsedInviteToken {
  inviteId: string;
  expiresEpoch: number;
}

export function verifyInviteToken(token: string): ParsedInviteToken | null {
  const parts = token.split(":");
  if (parts.length !== 3) return null;

  const [inviteId, expiresStr, sig] = parts;
  if (!inviteId || !expiresStr || !sig) return null;

  const expiresEpoch = parseInt(expiresStr, 10);
  if (isNaN(expiresEpoch)) return null;

  if (Date.now() / 1000 > expiresEpoch) return null;

  const payload = `${inviteId}:${expiresStr}`;
  const expected = createHmac("sha256", getSecret())
    .update(payload)
    .digest("hex");

  if (sig !== expected) return null;

  return { inviteId, expiresEpoch };
}

export function generateSecurePassword(): string {
  return randomBytes(24).toString("base64url");
}
