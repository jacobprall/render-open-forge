import { eq, sql } from "drizzle-orm";
import { sessions, usageEvents } from "@openforge/db";
import type { ForgeOrg, ForgeOrgMember } from "../forge/types";
import type { PlatformDb } from "../interfaces/database";
import type { AuthContext } from "../interfaces/auth";
import { getDefaultForgeProvider } from "../forge/factory";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_QUOTA = {
  maxModelTokens: 10_000_000,
  maxSandboxMinutes: 500,
  maxConcurrentSessions: 10,
  maxStorageGB: 10,
};

// ---------------------------------------------------------------------------
// Parameter and result types
// ---------------------------------------------------------------------------

export interface CreateOrgParams {
  login: string;
  fullName?: string;
  description?: string;
}

export interface QuotaEntry {
  label: string;
  used: number;
  limit: number;
  unit: string;
}

export interface UsageResult {
  quotas: QuotaEntry[];
}

// ---------------------------------------------------------------------------
// OrgService
// ---------------------------------------------------------------------------

export class OrgService {
  constructor(private db: PlatformDb) {}

  // -------------------------------------------------------------------------
  // listOrgs — GET /api/orgs
  // -------------------------------------------------------------------------

  async listOrgs(auth: AuthContext): Promise<ForgeOrg[]> {
    const forge = getDefaultForgeProvider(auth.forgeToken);
    return forge.orgs.list();
  }

  // -------------------------------------------------------------------------
  // createOrg — POST /api/orgs
  // -------------------------------------------------------------------------

  async createOrg(auth: AuthContext, params: CreateOrgParams): Promise<ForgeOrg> {
    const forge = getDefaultForgeProvider(auth.forgeToken);
    return forge.orgs.create(params.login, {
      fullName: params.fullName,
      description: params.description,
    });
  }

  // -------------------------------------------------------------------------
  // deleteOrg — DELETE /api/orgs/[org]
  // -------------------------------------------------------------------------

  async deleteOrg(auth: AuthContext, org: string): Promise<void> {
    const forge = getDefaultForgeProvider(auth.forgeToken);
    await forge.orgs.delete(org);
  }

  // -------------------------------------------------------------------------
  // listMembers — GET /api/orgs/[org]/members
  // -------------------------------------------------------------------------

  async listMembers(auth: AuthContext, org: string): Promise<ForgeOrgMember[]> {
    const forge = getDefaultForgeProvider(auth.forgeToken);
    return forge.orgs.listMembers(org);
  }

  // -------------------------------------------------------------------------
  // addMember — PUT /api/orgs/[org]/members
  // -------------------------------------------------------------------------

  async addMember(auth: AuthContext, org: string, username: string): Promise<void> {
    const forge = getDefaultForgeProvider(auth.forgeToken);
    await forge.orgs.addMember(org, username);
  }

  // -------------------------------------------------------------------------
  // removeMember — DELETE /api/orgs/[org]/members
  // -------------------------------------------------------------------------

  async removeMember(auth: AuthContext, org: string, username: string): Promise<void> {
    const forge = getDefaultForgeProvider(auth.forgeToken);
    await forge.orgs.removeMember(org, username);
  }

  // -------------------------------------------------------------------------
  // listSecrets — GET /api/orgs/[org]/secrets
  // -------------------------------------------------------------------------

  async listSecrets(auth: AuthContext, org: string): Promise<string[]> {
    const forge = getDefaultForgeProvider(auth.forgeToken);
    return forge.orgs.secrets.list(org);
  }

  // -------------------------------------------------------------------------
  // setSecret — POST /api/orgs/[org]/secrets
  // -------------------------------------------------------------------------

  async setSecret(auth: AuthContext, org: string, name: string, value: string): Promise<void> {
    const forge = getDefaultForgeProvider(auth.forgeToken);
    await forge.orgs.secrets.set(org, name, value);
  }

  // -------------------------------------------------------------------------
  // deleteSecret — DELETE /api/orgs/[org]/secrets/[name]
  // -------------------------------------------------------------------------

  async deleteSecret(auth: AuthContext, org: string, name: string): Promise<void> {
    const forge = getDefaultForgeProvider(auth.forgeToken);
    await forge.orgs.secrets.delete(org, name);
  }

  // -------------------------------------------------------------------------
  // getUsage — GET /api/orgs/[org]/usage
  // Note: the org param is not used; usage is scoped per userId.
  // -------------------------------------------------------------------------

  async getUsage(auth: AuthContext): Promise<UsageResult> {
    const userId = auth.userId;
    let totalTokens = 0;
    let activeSessions = 0;

    try {
      const tokenResult = await this.db
        .select({
          total: sql<number>`COALESCE(SUM(${usageEvents.inputTokens} + ${usageEvents.outputTokens}), 0)`,
        })
        .from(usageEvents)
        .where(eq(usageEvents.userId, userId));
      totalTokens = Number(tokenResult[0]?.total ?? 0);
    } catch {
      // table may not exist yet
    }

    try {
      const sessionResult = await this.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(sessions)
        .where(eq(sessions.userId, userId));
      activeSessions = Number(sessionResult[0]?.count ?? 0);
    } catch {
      // fallback
    }

    const quotas: QuotaEntry[] = [
      {
        label: "Model Tokens",
        used: totalTokens,
        limit: DEFAULT_QUOTA.maxModelTokens,
        unit: "tokens",
      },
      {
        label: "Sandbox Minutes",
        used: 0,
        limit: DEFAULT_QUOTA.maxSandboxMinutes,
        unit: "min",
      },
      {
        label: "Active Sessions",
        used: activeSessions,
        limit: DEFAULT_QUOTA.maxConcurrentSessions,
        unit: "sessions",
      },
      {
        label: "Storage",
        used: 0,
        limit: DEFAULT_QUOTA.maxStorageGB * 1024,
        unit: "MB",
      },
    ];

    return { quotas };
  }
}
