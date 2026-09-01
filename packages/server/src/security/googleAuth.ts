import type { TrustedAuthContext } from "../types.js";

const DEFAULT_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

export interface GoogleAuthVerifierOptions {
  readonly clientId: string;
  readonly fetch?: typeof fetch;
  readonly jwksUrl?: string;
  readonly clockSkewSeconds?: number;
}

export type GoogleAuthVerificationErrorCode =
  | "MALFORMED_TOKEN"
  | "UNSUPPORTED_ALGORITHM"
  | "KEY_NOT_FOUND"
  | "KEY_SET_UNAVAILABLE"
  | "INVALID_SIGNATURE"
  | "INVALID_CLAIMS";

export class GoogleAuthVerificationError extends Error {
  readonly code: GoogleAuthVerificationErrorCode;

  constructor(
    code: GoogleAuthVerificationErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "GoogleAuthVerificationError";
    this.code = code;
  }
}

interface JwtHeader {
  readonly alg?: unknown;
  readonly kid?: unknown;
}

interface GoogleJwkSet {
  readonly keys?: ReadonlyArray<JsonWebKey & { readonly kid?: string; readonly use?: string }>;
}

function decodePart(value: string): string {
  try {
    const normalized = value
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=");
    return new TextDecoder().decode(
      Uint8Array.from(globalThis.atob(normalized), (character) => character.charCodeAt(0)),
    );
  } catch (cause) {
    throw new GoogleAuthVerificationError(
      "MALFORMED_TOKEN",
      "Google ID token is not valid base64url.",
      {
        cause,
      },
    );
  }
}

function parseJson<T>(value: string, message: string): T {
  try {
    return JSON.parse(value) as T;
  } catch (cause) {
    throw new GoogleAuthVerificationError("MALFORMED_TOKEN", message, { cause });
  }
}

function bytes(value: string): ArrayBuffer {
  try {
    const normalized = value
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=");
    const decoded = Uint8Array.from(globalThis.atob(normalized), (character) =>
      character.charCodeAt(0),
    );
    const copy = new Uint8Array(decoded.byteLength);
    copy.set(decoded);
    return copy.buffer;
  } catch (cause) {
    throw new GoogleAuthVerificationError(
      "MALFORMED_TOKEN",
      "Google ID token signature is invalid.",
      {
        cause,
      },
    );
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new GoogleAuthVerificationError("MALFORMED_TOKEN", "Google ID token payload is invalid.");
  return value as Record<string, unknown>;
}

function validAudience(value: unknown, clientId: string): boolean {
  return typeof value === "string"
    ? value === clientId
    : Array.isArray(value) && value.includes(clientId);
}

async function loadJwk(
  kid: string,
  options: GoogleAuthVerifierOptions,
): Promise<JsonWebKey & { readonly kid?: string; readonly use?: string }> {
  const fetcher = options.fetch ?? globalThis.fetch;
  try {
    const response = await fetcher(options.jwksUrl ?? DEFAULT_JWKS_URL);
    if (!response.ok) throw new Error(`JWKS request returned ${response.status}.`);
    const payload = (await response.json()) as GoogleJwkSet;
    const key = payload.keys?.find((candidate) => candidate.kid === kid);
    if (key === undefined)
      throw new GoogleAuthVerificationError("KEY_NOT_FOUND", "Google signing key was not found.");
    return key;
  } catch (error) {
    if (error instanceof GoogleAuthVerificationError) throw error;
    throw new GoogleAuthVerificationError(
      "KEY_SET_UNAVAILABLE",
      "Google signing keys are unavailable.",
      {
        cause: error,
      },
    );
  }
}

/** Verifies a Google OIDC ID token and converts it to the server auth boundary. */
export async function createGoogleAuthContext(
  idToken: string,
  options: GoogleAuthVerifierOptions,
): Promise<TrustedAuthContext> {
  const parts = idToken.split(".");
  if (parts.length !== 3 || options.clientId.trim() === "")
    throw new GoogleAuthVerificationError("MALFORMED_TOKEN", "Google ID token must be a JWT.");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (encodedHeader === undefined || encodedPayload === undefined || encodedSignature === undefined)
    throw new GoogleAuthVerificationError("MALFORMED_TOKEN", "Google ID token must be a JWT.");
  const header = parseJson<JwtHeader>(
    decodePart(encodedHeader),
    "Google ID token header is invalid.",
  );
  if (header.alg !== "RS256")
    throw new GoogleAuthVerificationError(
      "UNSUPPORTED_ALGORITHM",
      "Google ID token must use RS256.",
    );
  if (typeof header.kid !== "string" || header.kid === "")
    throw new GoogleAuthVerificationError("MALFORMED_TOKEN", "Google ID token has no key id.");
  const payload = record(
    parseJson<unknown>(decodePart(encodedPayload), "Google ID token payload is invalid."),
  );
  const key = await loadJwk(header.kid, options);
  const signingKey = await globalThis.crypto.subtle.importKey(
    "jwk",
    key,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await globalThis.crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    signingKey,
    bytes(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid)
    throw new GoogleAuthVerificationError(
      "INVALID_SIGNATURE",
      "Google ID token signature is invalid.",
    );
  const skew = Math.max(0, options.clockSkewSeconds ?? 60);
  const now = Math.floor(Date.now() / 1000);
  if (
    !GOOGLE_ISSUERS.has(String(payload.iss)) ||
    !validAudience(payload.aud, options.clientId) ||
    typeof payload.sub !== "string" ||
    payload.sub.trim() === "" ||
    typeof payload.exp !== "number" ||
    !Number.isFinite(payload.exp) ||
    now > payload.exp + skew ||
    (payload.iat !== undefined &&
      (typeof payload.iat !== "number" ||
        !Number.isFinite(payload.iat) ||
        payload.iat > now + skew))
  )
    throw new GoogleAuthVerificationError("INVALID_CLAIMS", "Google ID token claims are invalid.");
  return {
    authenticatedUserId: payload.sub,
    isAnonymous: false,
    claims: payload,
  };
}
