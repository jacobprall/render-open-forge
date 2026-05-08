/**
 * Pluggable authentication provider interface.
 *
 * Decouples the platform from NextAuth so the gateway (or any host)
 * can resolve authentication tokens to AuthContext using any strategy.
 */

import type { AuthContext } from "./auth";

export interface AuthProvider {
  /**
   * Resolve a bearer token (API key, JWT, session token) to an AuthContext.
   * Returns null if the token is invalid or expired.
   */
  resolve(token: string): Promise<AuthContext | null>;
}

// ---------------------------------------------------------------------------
// Static token provider (development / single-user)
// ---------------------------------------------------------------------------

export class StaticTokenAuthProvider implements AuthProvider {
  constructor(
    private token: string,
    private context: AuthContext,
  ) {}

  async resolve(token: string): Promise<AuthContext | null> {
    return token === this.token ? this.context : null;
  }
}

// ---------------------------------------------------------------------------
// Composite: try multiple providers in order (first non-null wins)
// ---------------------------------------------------------------------------

export class CompositeAuthProvider implements AuthProvider {
  constructor(private providers: AuthProvider[]) {}

  async resolve(token: string): Promise<AuthContext | null> {
    for (const provider of this.providers) {
      const result = await provider.resolve(token);
      if (result) return result;
    }
    return null;
  }
}
