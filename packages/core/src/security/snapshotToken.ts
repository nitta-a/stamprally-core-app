export type SnapshotSecretKey = string | Uint8Array;

export interface SnapshotTokenPayload {
  readonly [key: string]: unknown;
  readonly expiresAt?: string;
  readonly exp?: number;
}

export type SnapshotTokenErrorCode =
  | "MALFORMED"
  | "INVALID_SIGNATURE"
  | "DECRYPTION_FAILED"
  | "EXPIRED"
  | "UNSUPPORTED";

export interface SnapshotTokenError {
  readonly code: SnapshotTokenErrorCode;
  readonly message: string;
}

export type SnapshotTokenVerification<T extends SnapshotTokenPayload = SnapshotTokenPayload> =
  | { readonly ok: true; readonly valid: true; readonly payload: T }
  | { readonly ok: false; readonly valid: false; readonly error: SnapshotTokenError };

const encoder = new TextEncoder();

function cryptoApi(): Crypto {
  if (globalThis.crypto === undefined || globalThis.crypto.subtle === undefined) {
    throw new Error("Web Crypto API is unavailable in this environment.");
  }
  return globalThis.crypto;
}

function secretBytes(secretKey: SnapshotSecretKey): Uint8Array {
  return typeof secretKey === "string" ? encoder.encode(secretKey) : new Uint8Array(secretKey);
}

function webCryptoBytes(bytes: Uint8Array): BufferSource {
  return bytes.buffer as ArrayBuffer;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
  const binary = globalThis.atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function importHmacKey(secret: Uint8Array): Promise<CryptoKey> {
  return cryptoApi().subtle.importKey(
    "raw",
    webCryptoBytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function importAesKey(secret: Uint8Array): Promise<CryptoKey> {
  const digest = await cryptoApi().subtle.digest("SHA-256", webCryptoBytes(secret));
  return cryptoApi().subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function isExpired(payload: SnapshotTokenPayload, now: number): boolean {
  if (typeof payload.exp === "number" && now >= payload.exp * 1000) return true;
  return payload.expiresAt !== undefined && Date.parse(payload.expiresAt) <= now;
}

export async function createSignedSnapshotToken<T extends SnapshotTokenPayload>(
  payload: T,
  secretKey: SnapshotSecretKey,
): Promise<string> {
  const api = cryptoApi();
  const secret = secretBytes(secretKey);
  const iv = api.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(payload));
  const encrypted = new Uint8Array(
    await api.subtle.encrypt(
      { name: "AES-GCM", iv: webCryptoBytes(iv) },
      await importAesKey(secret),
      webCryptoBytes(plaintext),
    ),
  );
  const body = base64Url(new Uint8Array([...iv, ...encrypted]));
  const signature = new Uint8Array(
    await api.subtle.sign("HMAC", await importHmacKey(secret), encoder.encode(body)),
  );
  return `sr2.${body}.${base64Url(signature)}`;
}

export async function verifySnapshotToken<T extends SnapshotTokenPayload = SnapshotTokenPayload>(
  token: string,
  secretKey: SnapshotSecretKey,
  now = Date.now(),
): Promise<SnapshotTokenVerification<T>> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== "sr2") {
      return {
        ok: false,
        valid: false,
        error: { code: "MALFORMED", message: "Snapshot token is malformed." },
      };
    }
    const [, body, encodedSignature] = parts;
    if (body === undefined || encodedSignature === undefined) {
      return {
        ok: false,
        valid: false,
        error: { code: "MALFORMED", message: "Snapshot token is malformed." },
      };
    }
    const secret = secretBytes(secretKey);
    const validSignature = await cryptoApi().subtle.verify(
      "HMAC",
      await importHmacKey(secret),
      webCryptoBytes(fromBase64Url(encodedSignature)),
      webCryptoBytes(encoder.encode(body)),
    );
    if (!validSignature) {
      return {
        ok: false,
        valid: false,
        error: { code: "INVALID_SIGNATURE", message: "Snapshot token signature is invalid." },
      };
    }
    const encrypted = fromBase64Url(body);
    if (encrypted.length <= 12) throw new Error("Invalid encrypted payload.");
    const payloadText = await cryptoApi().subtle.decrypt(
      { name: "AES-GCM", iv: webCryptoBytes(encrypted.slice(0, 12)) },
      await importAesKey(secret),
      webCryptoBytes(encrypted.slice(12)),
    );
    const payload: unknown = JSON.parse(new TextDecoder().decode(payloadText));
    if (typeof payload !== "object" || payload === null || Array.isArray(payload))
      throw new Error("Invalid payload.");
    if (isExpired(payload as SnapshotTokenPayload, now)) {
      return {
        ok: false,
        valid: false,
        error: { code: "EXPIRED", message: "Snapshot token has expired." },
      };
    }
    return { ok: true, valid: true, payload: payload as T };
  } catch {
    return {
      ok: false,
      valid: false,
      error: { code: "DECRYPTION_FAILED", message: "Snapshot token could not be verified." },
    };
  }
}
