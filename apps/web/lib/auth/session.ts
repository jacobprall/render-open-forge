import { cache } from "react";
import { auth } from "@/lib/auth";

/**
 * Application-level session shape.
 *
 * This interface is consumed by every server component, API route, and
 * server action. It acts as a stable contract on top of NextAuth's
 * session, isolating the rest of the codebase from auth internals.
 */
export interface UserSession {
  forgejoToken: string;
  userId: string;
  username: string;
  email: string;
  avatarUrl: string;
  isAdmin: boolean;
}

async function readSession(): Promise<UserSession | null> {
  const session = await auth();
  if (!session?.user) return null;

  return {
    forgejoToken: session.forgejoToken,
    userId: session.user.id,
    username: session.forgejoUsername,
    email: session.user.email ?? "",
    avatarUrl: session.user.image ?? "",
    isAdmin: session.isAdmin ?? false,
  };
}

/** Per-request deduplicated session (React.cache). */
export const getSession = cache(readSession);
