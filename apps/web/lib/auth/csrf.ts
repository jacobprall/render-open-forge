import { randomBytes, createHmac, timingSafeEqual } from "crypto";

function resolveCsrfSecret(): string {
  const envSecret = process.env.CSRF_SECRET;
  if (envSecret) return envSecret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("CSRF_SECRET must be set in production");
  }
  console.warn(
    "CSRF_SECRET is not set; using a randomly generated secret per process. Set CSRF_SECRET in your environment.",
  );
  return randomBytes(32).toString("hex");
}

const CSRF_SECRET = resolveCsrfSecret();

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
  if (nonce === undefined || hmac === undefined) return false;
  const expected = createHmac("sha256", CSRF_SECRET)
    .update(nonce)
    .digest("hex");
  const hmacBuf = Buffer.from(hmac, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (hmacBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(hmacBuf, expectedBuf);
}
