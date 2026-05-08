/**
 * First-run provisioning script for Forgejo.
 *
 * Creates:
 * 1. Admin user (for platform management)
 * 2. Agent service account (for agent git operations)
 * 3. Registers the Next.js app as an OAuth2 application
 * 4. Optionally configures Google OAuth as an external auth source
 *
 * Run with: bun run infrastructure/forgejo/setup.ts
 */

export {};

const FORGEJO_URL = process.env.FORGEJO_INTERNAL_URL || "http://localhost:3000";
const ADMIN_USER = process.env.FORGEJO_ADMIN_USER || "forge-admin";
const ADMIN_PASSWORD = process.env.FORGEJO_ADMIN_PASSWORD || "admin-password-change-me";
const ADMIN_EMAIL = process.env.FORGEJO_ADMIN_EMAIL || "admin@openforge.local";
const AGENT_USER = "openforge-agent";
const AGENT_PASSWORD = process.env.FORGEJO_AGENT_PASSWORD || "agent-password-change-me";

const WEB_APP_URL = process.env.FORGEJO_EXTERNAL_URL || "http://localhost:4000";

async function waitForForgejo(maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${FORGEJO_URL}/api/v1/version`);
      if (res.ok) {
        console.log(`Forgejo is ready (attempt ${i + 1})`);
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Forgejo did not become ready");
}

async function apiRequest(path: string, opts: RequestInit & { token?: string } = {}): Promise<Response> {
  const { token, ...fetchOpts } = opts;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    ...(opts.headers as Record<string, string> || {}),
  };
  if (token) headers["Authorization"] = `token ${token}`;
  return fetch(`${FORGEJO_URL}/api/v1${path}`, { ...fetchOpts, headers });
}

async function createUser(username: string, password: string, email: string, isAdmin: boolean): Promise<void> {
  const res = await apiRequest("/admin/users", {
    method: "POST",
    token: adminToken,
    body: JSON.stringify({
      username,
      password,
      email,
      must_change_password: false,
      login_name: username,
      source_id: 0,
      visibility: "public",
      is_admin: isAdmin,
    }),
  });

  if (res.status === 422) {
    console.log(`User ${username} already exists`);
    if (isAdmin) {
      await apiRequest(`/admin/users/${username}`, {
        method: "PATCH",
        token: adminToken,
        body: JSON.stringify({ is_admin: true, login_name: username, source_id: 0 }),
      });
      console.log(`  → Promoted ${username} to admin`);
    }
    return;
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create user ${username}: ${res.status} ${body}`);
  }
  console.log(`Created user: ${username}`);
}

async function createToken(username: string, password: string, tokenName: string): Promise<string> {
  const authHeader = `Basic ${btoa(`${username}:${password}`)}`;

  // Delete any existing token with this name so we can recreate it
  const listRes = await fetch(`${FORGEJO_URL}/api/v1/users/${username}/tokens`, {
    headers: { Authorization: authHeader },
  });
  if (listRes.ok) {
    const tokens = await listRes.json() as { id: number; name: string }[];
    const existing = tokens.find((t) => t.name === tokenName);
    if (existing) {
      await fetch(`${FORGEJO_URL}/api/v1/users/${username}/tokens/${existing.id}`, {
        method: "DELETE",
        headers: { Authorization: authHeader },
      });
    }
  }

  const res = await fetch(`${FORGEJO_URL}/api/v1/users/${username}/tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({
      name: tokenName,
      scopes: ["all"],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create token for ${username}: ${res.status} ${body}`);
  }

  const data = await res.json() as { sha1: string };
  return data.sha1;
}

async function registerOAuth2App(token: string): Promise<{ clientId: string; clientSecret: string }> {
  const res = await apiRequest("/user/applications/oauth2", {
    method: "POST",
    token,
    body: JSON.stringify({
      name: "openforge-web",
      redirect_uris: [`${WEB_APP_URL}/api/auth/callback`],
      confidential_client: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (body.includes("already exists")) {
      console.log("OAuth2 app already registered");
      return { clientId: "existing", clientSecret: "existing" };
    }
    throw new Error(`Failed to register OAuth2 app: ${res.status} ${body}`);
  }

  const data = await res.json() as { client_id: string; client_secret: string };
  return { clientId: data.client_id, clientSecret: data.client_secret };
}

let adminToken = "";

async function main() {
  console.log("=== OpenForge: Forgejo Setup ===\n");

  await waitForForgejo();

  // Step 1: Create admin token (using basic auth for initial setup)
  console.log("\n--- Step 1: Admin token ---");
  try {
    adminToken = await createToken(ADMIN_USER, ADMIN_PASSWORD, "setup-script");
    console.log("Admin token created");
  } catch (err) {
    console.error(`Failed to authenticate as "${ADMIN_USER}" at ${FORGEJO_URL}`);
    console.error(`  Error: ${err instanceof Error ? err.message : err}`);
    console.error(`\nPossible causes:`);
    console.error(`  1. User "${ADMIN_USER}" doesn't exist — create via Render Shell:`);
    console.error(`     su -c 'forgejo admin user create --admin --username ${ADMIN_USER} --password <password> --email <email>' git`);
    console.error(`  2. Wrong password — check FORGEJO_ADMIN_PASSWORD`);
    console.error(`  3. Wrong URL — check FORGEJO_INTERNAL_URL (currently: ${FORGEJO_URL})`);
    process.exit(1);
  }

  // Step 2: Create agent service account (admin so it can push to any repo)
  console.log("\n--- Step 2: Agent service account ---");
  await createUser(AGENT_USER, AGENT_PASSWORD, "agent@openforge.local", true);
  const agentToken = await createToken(AGENT_USER, AGENT_PASSWORD, "agent-service");
  console.log(`Agent token: ${agentToken}`);
  console.log(`  → Set FORGEJO_AGENT_TOKEN=${agentToken} in your .env`);

  // Step 3: Register OAuth2 application
  console.log("\n--- Step 3: OAuth2 application ---");
  const oauth = await registerOAuth2App(adminToken);
  console.log(`OAuth2 Client ID: ${oauth.clientId}`);
  console.log(`OAuth2 Client Secret: ${oauth.clientSecret}`);
  console.log(`  → Set FORGEJO_OAUTH_CLIENT_ID=${oauth.clientId}`);
  console.log(`  → Set FORGEJO_OAUTH_CLIENT_SECRET=${oauth.clientSecret}`);

  console.log("\n=== Setup complete ===");
  console.log("\nNext steps:");
  console.log("1. Add the env vars above to your .env file");
  console.log("2. Configure Google OAuth in Forgejo admin panel:");
  console.log(`   ${FORGEJO_URL}/-/admin/auths/new`);
  console.log("   Type: OAuth2, Provider: OpenID Connect");
  console.log("   Discovery URL: https://accounts.google.com/.well-known/openid-configuration");
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
