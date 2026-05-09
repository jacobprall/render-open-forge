import { NextRequest } from "next/server";

export function isAuthorizedObservabilityRequest(req: NextRequest): boolean {
  const secret = process.env.OBSERVABILITY_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}
