const FORGEJO_INTERNAL_URL =
  process.env.FORGEJO_INTERNAL_URL || "http://localhost:3000";

export interface ForgejoUserProfile {
  id: number;
  login: string;
  email: string;
  avatar_url: string;
  full_name?: string;
}

/**
 * Create a personal access token for a Forgejo user.
 * Uses basic auth with the user's password (Forgejo blocks Sudo on token endpoints).
 */
export async function createForgejoApiTokenForUser(
  username: string,
  password: string,
): Promise<{ token: string; profile: ForgejoUserProfile }> {
  const agentToken = process.env.FORGEJO_AGENT_TOKEN;
  if (!agentToken) throw new Error("FORGEJO_AGENT_TOKEN not configured");

  const userRes = await fetch(
    `${FORGEJO_INTERNAL_URL}/api/v1/users/${encodeURIComponent(username)}`,
    { headers: { Authorization: `token ${agentToken}` } },
  );

  if (!userRes.ok) {
    throw new Error(`Failed to look up Forgejo user: ${userRes.status}`);
  }

  const profile = (await userRes.json()) as ForgejoUserProfile;

  const basicAuth = Buffer.from(`${username}:${password}`).toString("base64");
  const tokenRes = await fetch(
    `${FORGEJO_INTERNAL_URL}/api/v1/users/${encodeURIComponent(username)}/tokens`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${basicAuth}`,
      },
      body: JSON.stringify({
        name: `open-forge-app-${Date.now()}`,
        scopes: ["all"],
      }),
    },
  );

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(`Failed to create Forgejo token: ${tokenRes.status} ${body}`);
  }

  const tokenData = (await tokenRes.json()) as { sha1: string };
  return { token: tokenData.sha1, profile };
}
