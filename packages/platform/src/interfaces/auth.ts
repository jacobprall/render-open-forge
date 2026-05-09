import type { ForgeProviderType } from "../forge/provider";

/**
 * Auth context passed to service methods.
 * Framework-agnostic — the HTTP layer (Hono/Next) resolves the
 * authenticated user and passes this into services.
 */
export interface AuthContext {
  userId: string;
  username: string;
  forgeToken: string;
  forgeType?: ForgeProviderType;
  isAdmin: boolean;
}
