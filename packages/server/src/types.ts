/** Authentication already verified by the host application's middleware. */
export interface TrustedAuthContext {
  readonly authenticatedUserId: string;
  readonly isAnonymous?: boolean;
  readonly sessionId?: string;
  readonly claims?: Record<string, unknown>;
}

/** @deprecated Use TrustedAuthContext. */
export type AuthenticationContext = TrustedAuthContext;
