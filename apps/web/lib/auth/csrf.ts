import { randomBytes, createHmac } from "crypto";

const CSRF_SECRET = process.env.CSRF_SECRET || "render-open-forge-csrf-secret";

export function generateCsrfToken(): string {
  const nonce = randomBytes(32).toString("hex");
  const hmac = createHmac("sha256", CSRF_SECRET).update(nonce).digest("hex");
  return `${nonce}.${hmac}`;
}

export function validateCsrfToken(
  token: string,
  _sessionToken: string,
): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [nonce, hmac] = parts;
  const expected = createHmac("sha256", CSRF_SECRET)
    .update(nonce!)
    .digest("hex");
  return hmac === expected;
}
