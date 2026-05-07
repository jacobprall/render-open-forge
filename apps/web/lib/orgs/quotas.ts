export interface OrgQuota {
  maxSandboxMinutes: number;
  maxModelTokens: number;
  maxStorageGB: number;
  maxConcurrentSessions: number;
}

export const DEFAULT_QUOTA: OrgQuota = {
  maxSandboxMinutes: 1000,
  maxModelTokens: 10_000_000,
  maxStorageGB: 50,
  maxConcurrentSessions: 5,
};

export interface UsageSummary {
  sandboxMinutesUsed: number;
  modelTokensUsed: number;
  storageGBUsed: number;
  activeSessions: number;
}

export function isWithinQuota(usage: UsageSummary, quota: OrgQuota): boolean {
  return (
    usage.sandboxMinutesUsed <= quota.maxSandboxMinutes &&
    usage.modelTokensUsed <= quota.maxModelTokens &&
    usage.storageGBUsed <= quota.maxStorageGB &&
    usage.activeSessions <= quota.maxConcurrentSessions
  );
}

export function getQuotaUsagePercent(
  usage: UsageSummary,
  quota: OrgQuota,
): Record<string, number> {
  return {
    sandboxMinutes: Math.round(
      (usage.sandboxMinutesUsed / quota.maxSandboxMinutes) * 100,
    ),
    modelTokens: Math.round(
      (usage.modelTokensUsed / quota.maxModelTokens) * 100,
    ),
    storageGB: Math.round((usage.storageGBUsed / quota.maxStorageGB) * 100),
    concurrentSessions: Math.round(
      (usage.activeSessions / quota.maxConcurrentSessions) * 100,
    ),
  };
}
