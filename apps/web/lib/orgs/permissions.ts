export type OrgRole = "owner" | "admin" | "developer" | "viewer";

export const ROLE_PERMISSIONS: Record<OrgRole, string[]> = {
  owner: ["*"],
  admin: [
    "repo:create",
    "repo:delete",
    "repo:settings",
    "agent:trigger",
    "agent:config",
    "pr:merge",
    "pr:review",
  ],
  developer: ["repo:create", "agent:trigger", "pr:review", "pr:create"],
  viewer: ["repo:read", "pr:read"],
};

export function hasPermission(role: OrgRole, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  return perms.includes("*") || perms.includes(permission);
}

export function checkPermission(role: OrgRole, permission: string): void {
  if (!hasPermission(role, permission)) {
    throw new Error(`Insufficient permissions: requires ${permission}`);
  }
}
