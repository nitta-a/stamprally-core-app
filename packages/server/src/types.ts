/** Authentication already verified by the host application's middleware. */
export interface TrustedAuthContext {
  readonly authenticatedUserId: string;
  readonly isAnonymous?: boolean;
  readonly sessionId?: string;
  readonly claims?: Record<string, unknown>;
}

/** Authentication accepted by direct server methods. Strings are a convenience for trusted callers. */
export type AuthInput = TrustedAuthContext | { readonly userId: string } | string;

/** Normalizes the supported direct-method authentication forms at the server boundary. */
export function normalizeAuthContext(auth: AuthInput): TrustedAuthContext {
  if (typeof auth === "string") return { authenticatedUserId: auth, isAnonymous: false };
  if ("authenticatedUserId" in auth) return auth;
  return { authenticatedUserId: auth.userId, isAnonymous: false };
}

/** @deprecated Use TrustedAuthContext. */
export type AuthenticationContext = TrustedAuthContext;
