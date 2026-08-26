export type SecureTokenSecretKey = string | Uint8Array;

export interface SecureTokenOptions {
  readonly encrypt?: boolean;
  readonly expiresInSeconds?: number;
}

export interface SecureTokenPayload {
  readonly [key: string]: unknown;
  readonly exp?: number;
}

export type SecureTokenErrorCode =
  | "MALFORMED"
  | "INVALID_SIGNATURE"
  | "DECRYPTION_FAILED"
  | "INVALID_PAYLOAD"
  | "EXPIRED";

export interface SecureTokenError {
  readonly code: SecureTokenErrorCode;
  readonly message: string;
}

export type SecureTokenVerification<T extends SecureTokenPayload = SecureTokenPayload> =
  | { readonly ok: true; readonly valid: true; readonly payload: T }
  | { readonly ok: false; readonly valid: false; readonly error: SecureTokenError };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function cryptoApi(): Crypto {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error("Web Crypto API is unavailable in this environment.");
  }
  return globalThis.crypto;
}

function bytes(value: SecureTokenSecretKey): Uint8Array {
  return typeof value === "string" ? encoder.encode(value) : new Uint8Array(value);
}

function source(value: Uint8Array): BufferSource {
  return value.buffer as ArrayBuffer;
}

function encode(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decode(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
  return Uint8Array.from(globalThis.atob(padded), (character) => character.charCodeAt(0));
}

async function hmacKey(secret: Uint8Array): Promise<CryptoKey> {
  return cryptoApi().subtle.importKey(
    "raw",
    source(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function aesKey(secret: Uint8Array): Promise<CryptoKey> {
  const digest = await cryptoApi().subtle.digest("SHA-256", source(secret));
  return cryptoApi().subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function createSecureToken<T extends SecureTokenPayload>(
  payload: T,
  secretKey: SecureTokenSecretKey,
  options: SecureTokenOptions = {},
): Promise<string> {
  const api = cryptoApi();
  const expiresInSeconds = options.expiresInSeconds;
  const effectivePayload =
    expiresInSeconds === undefined || payload.exp !== undefined
      ? payload
      : ({ ...payload, exp: Math.floor(Date.now() / 1000) + expiresInSeconds } as T);
  const secret = bytes(secretKey);
  const plaintext = encoder.encode(JSON.stringify(effectivePayload));
  const actualBody =
    options.encrypt === true ? await encryptPayload(plaintext, secret, api) : encode(plaintext);
  const signature = new Uint8Array(
    await api.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(actualBody)),
  );
  return `sr3.${options.encrypt === true ? "e" : "p"}.${actualBody}.${encode(signature)}`;
}

async function encryptPayload(
  plaintext: Uint8Array,
  secret: Uint8Array,
  api: Crypto,
): Promise<string> {
  const iv = api.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await api.subtle.encrypt(
      { name: "AES-GCM", iv: source(iv) },
      await aesKey(secret),
      source(plaintext),
    ),
  );
  return encode(new Uint8Array([...iv, ...encrypted]));
}

export async function verifySecureToken<T extends SecureTokenPayload = SecureTokenPayload>(
  token: string,
  secretKey: SecureTokenSecretKey,
  now = Date.now(),
): Promise<SecureTokenVerification<T>> {
  try {
    const parts = token.split(".");
    if (parts.length !== 4 || parts[0] !== "sr3" || (parts[1] !== "e" && parts[1] !== "p")) {
      return {
        ok: false,
        valid: false,
        error: { code: "MALFORMED", message: "Secure token is malformed." },
      };
    }
    const mode = parts[1];
    const body = parts[2];
    const encodedSignature = parts[3];
    if (body === undefined || encodedSignature === undefined || mode === undefined) {
      return {
        ok: false,
        valid: false,
        error: { code: "MALFORMED", message: "Secure token is malformed." },
      };
    }
    const secret = bytes(secretKey);
    const valid = await cryptoApi().subtle.verify(
      "HMAC",
      await hmacKey(secret),
      source(decode(encodedSignature)),
      source(encoder.encode(body)),
    );
    if (!valid)
      return {
        ok: false,
        valid: false,
        error: { code: "INVALID_SIGNATURE", message: "Secure token signature is invalid." },
      };
    const plaintext = mode === "e" ? await decryptPayload(body, secret) : decode(body);
    const parsed: unknown = JSON.parse(decoder.decode(plaintext));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {
        ok: false,
        valid: false,
        error: { code: "INVALID_PAYLOAD", message: "Secure token payload is invalid." },
      };
    }
    const payload = parsed as T;
    if (typeof payload.exp === "number" && now >= payload.exp * 1000) {
      return {
        ok: false,
        valid: false,
        error: { code: "EXPIRED", message: "Secure token has expired." },
      };
    }
    return { ok: true, valid: true, payload };
  } catch {
    return {
      ok: false,
      valid: false,
      error: { code: "DECRYPTION_FAILED", message: "Secure token could not be verified." },
    };
  }
}

async function decryptPayload(body: string, secret: Uint8Array): Promise<Uint8Array> {
  const encrypted = decode(body);
  if (encrypted.length <= 12) throw new Error("Invalid encrypted payload.");
  return new Uint8Array(
    await cryptoApi().subtle.decrypt(
      { name: "AES-GCM", iv: source(encrypted.slice(0, 12)) },
      await aesKey(secret),
      source(encrypted.slice(12)),
    ),
  );
}
