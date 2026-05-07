import { cookies } from "next/headers";

export interface UserSession {
  forgejoToken: string;
  userId: number;
  username: string;
  email: string;
  avatarUrl: string;
}

const SESSION_COOKIE = "forge_session";

export async function getSession(): Promise<UserSession | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE);
  if (!sessionCookie?.value) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(sessionCookie.value, "base64").toString("utf-8"),
    );
    return decoded as UserSession;
  } catch {
    return null;
  }
}

export function encodeSession(session: UserSession): string {
  return Buffer.from(JSON.stringify(session)).toString("base64");
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE;
}
