import type {
  CheckInRequest,
  CheckInResult,
  ClaimRequest,
  ClaimResult,
  ClientError,
  OfflineOperation,
  PublicCheckInCondition,
  PublicRallyConfig,
  SyncAdapter,
  SyncOperationResult,
  SyncProgressResponse,
  UserRallyState,
  VerificationContext,
} from "@stamprally/core";
import type { FetchLike } from "./network.js";

export interface HttpSyncAdapterOptions {
  readonly baseUrl: string;
  readonly fetch: FetchLike;
  readonly config: PublicRallyConfig;
  readonly headers?: Readonly<Record<string, string>>;
}

/** Raised for responses the client must keep queued (network, auth, validation, retryable). */
export class HttpSyncError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpSyncError";
    this.status = status;
    this.code = code;
  }
}

type WireError = {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
  readonly status?: string;
};
type WireCheckInResponse = { readonly ok: true; readonly state: UserRallyState } | WireError;
type WireClaimResponse =
  | { readonly ok: true; readonly state: UserRallyState; readonly claimTicketNumber?: string }
  | WireError;
type WireSyncResponse = {
  readonly ok: true;
  readonly results: ReadonlyArray<SyncOperationResult>;
  readonly currentState: UserRallyState;
  readonly syncTimestamp: number;
};

const CHECK_IN_ERROR_CODES = [
  "SPOT_NOT_FOUND",
  "STAMP_ALREADY_ACQUIRED",
  "PREREQUISITES_NOT_MET",
  "INVALID_PROOF",
] as const;
const CLAIM_ERROR_CODES = [
  "NOT_AVAILABLE",
  "ALREADY_CONSUMED",
  "OUT_OF_STOCK",
  "REWARD_NOT_FOUND",
] as const;

type CheckInErrorCode = (typeof CHECK_IN_ERROR_CODES)[number];
type ClaimErrorCode = (typeof CLAIM_ERROR_CODES)[number];

function isCheckInErrorCode(code: string): code is CheckInErrorCode {
  return (CHECK_IN_ERROR_CODES as ReadonlyArray<string>).includes(code);
}

function isClaimErrorCode(code: string): code is ClaimErrorCode {
  return (CLAIM_ERROR_CODES as ReadonlyArray<string>).includes(code);
}

function stringProofContext(
  proof: string,
  condition: PublicCheckInCondition,
): VerificationContext | null {
  if (condition.type === "passcode") return { type: "passcode", code: proof };
  if (condition.type === "qr") return { type: "qr", token: proof };
  if (condition.type === "nfc") return { type: "nfc", tagId: proof };
  if (condition.type === "custom") return { type: "custom", value: proof };
  return null;
}

/** Maps the raw proof a participant entered to the context shape the server verifies. */
export function toVerificationContext(
  proof: unknown,
  conditions: ReadonlyArray<PublicCheckInCondition>,
): VerificationContext | null {
  if (typeof proof === "string") {
    for (const condition of conditions) {
      const context = stringProofContext(proof, condition);
      if (context !== null) return context;
    }
    return null;
  }
  if (typeof proof !== "object" || proof === null || !("type" in proof)) return null;
  const candidate = proof as Record<string, unknown>;
  if (candidate.type === "passcode" && typeof candidate.code === "string")
    return { type: "passcode", code: candidate.code };
  if (candidate.type === "qr" && typeof candidate.token === "string")
    return { type: "qr", token: candidate.token };
  if (candidate.type === "nfc" && typeof candidate.tagId === "string")
    return { type: "nfc", tagId: candidate.tagId };
  if (
    candidate.type === "gps" &&
    typeof candidate.latitude === "number" &&
    typeof candidate.longitude === "number"
  )
    return { type: "gps", latitude: candidate.latitude, longitude: candidate.longitude };
  return null;
}

function checkInError(spotId: string, response: WireError): ClientError {
  const { code, message } = response;
  if (isCheckInErrorCode(code)) return { code, spotId, message };
  return { code: "SYNC_FAILED", message: `${code}: ${message}` };
}

function claimError(rewardId: string, response: WireError): ClientError {
  const { code, message } = response;
  if (code === "INVALID_PASSCODE") return { code, rewardId, message };
  if (code === "EXPIRED" || code === "USER_LIMIT_REACHED") return { code, rewardId };
  if (isClaimErrorCode(code)) return { code, rewardId };
  return { code: "SYNC_FAILED", message: `${code}: ${message}` };
}

function isPermanentRejection(body: unknown): body is WireError {
  if (typeof body !== "object" || body === null) return false;
  const candidate = body as Record<string, unknown>;
  return (
    candidate.ok === false &&
    candidate.status === "REJECTED_PERMANENT" &&
    typeof candidate.code === "string" &&
    typeof candidate.message === "string"
  );
}

function retryableError(status: number, body: unknown): HttpSyncError {
  if (typeof body === "object" && body !== null) {
    const candidate = body as Record<string, unknown>;
    const code = typeof candidate.code === "string" ? candidate.code : "HTTP_ERROR";
    const message = typeof candidate.message === "string" ? candidate.message : `HTTP ${status}`;
    return new HttpSyncError(status, code, message);
  }
  return new HttpSyncError(status, "HTTP_ERROR", `HTTP ${status}`);
}

export interface HttpSyncAdapter extends Required<SyncAdapter> {
  /** A batch-only adapter that sends queued operations through `/sync`. */
  readonly batch: SyncAdapter;
}

/**
 * A minimal HTTP transport for `StampRallyClient` that speaks the `StampRallyServer` wire format.
 * Permanent rejections become `{ ok: false }` results; everything else throws so the client
 * keeps the operation in its offline queue.
 */
export function createHttpSyncAdapter(options: HttpSyncAdapterOptions): HttpSyncAdapter {
  const { baseUrl, fetch, config, headers = {} } = options;

  function conditionsFor(spotId: string): ReadonlyArray<PublicCheckInCondition> {
    return config.spots.find((spot) => spot.id === spotId)?.conditions ?? [];
  }

  async function post(
    path: string,
    payload: unknown,
    anonymousSessionId: string | undefined,
  ): Promise<{ readonly status: number; readonly body: unknown }> {
    const requestHeaders: Record<string, string> = {
      "content-type": "application/json",
      ...headers,
      ...(anonymousSessionId === undefined ? {} : { "x-anonymous-session-id": anonymousSessionId }),
    };
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(payload),
    });
    const body: unknown = await response.json().catch(() => null);
    return { status: response.status, body };
  }

  function checkInPayload(request: CheckInRequest): Record<string, unknown> {
    const { rallyId, spotId, idempotencyKey, now, proofData } = request;
    const context = toVerificationContext(proofData, conditionsFor(spotId));
    return { rallyId, spotId, idempotencyKey, now, context };
  }

  function claimPayload(request: ClaimRequest): Record<string, unknown> {
    const { rallyId, rewardId, idempotencyKey, now, options: claimOptions } = request;
    const { staffPasscode, staffId } = claimOptions;
    return {
      rallyId,
      rewardId,
      idempotencyKey,
      now,
      ...(staffPasscode === undefined ? {} : { staffPasscode }),
      ...(staffId === undefined ? {} : { staffId }),
    };
  }

  function toServerOperation(operation: OfflineOperation): Record<string, unknown> {
    if (operation.kind === "checkIn")
      return { kind: "checkIn", request: checkInPayload(operation.request) };
    return { kind: "claimReward", request: claimPayload(operation.request) };
  }

  async function checkIn(request: CheckInRequest): Promise<CheckInResult> {
    const { spotId, anonymousSessionId } = request;
    const { status, body } = await post("/check-in", checkInPayload(request), anonymousSessionId);
    if (isPermanentRejection(body)) return { ok: false, error: checkInError(spotId, body) };
    if (status !== 200) throw retryableError(status, body);
    const { state } = body as Extract<WireCheckInResponse, { ok: true }>;
    const record = state.records.find((item) => item.stampId === spotId);
    if (record === undefined)
      throw new HttpSyncError(status, "PROTOCOL_ERROR", "Accepted check-in has no record.");
    return { ok: true, value: { state, record } };
  }

  async function claimReward(request: ClaimRequest): Promise<ClaimResult> {
    const { rewardId, anonymousSessionId } = request;
    const { status, body } = await post("/claim-reward", claimPayload(request), anonymousSessionId);
    if (isPermanentRejection(body)) return { ok: false, error: claimError(rewardId, body) };
    if (status !== 200) throw retryableError(status, body);
    const { state } = body as Extract<WireClaimResponse, { ok: true }>;
    const reward = state.rewards.find((item) => item.rewardId === rewardId);
    if (reward === undefined)
      throw new HttpSyncError(status, "PROTOCOL_ERROR", "Accepted claim has no reward state.");
    return { ok: true, value: { state, reward } };
  }

  async function sync(request: Parameters<NonNullable<SyncAdapter["sync"]>>[0]) {
    const { rallyId, anonymousSessionId, operations } = request;
    const payload = {
      rallyId,
      ...(operations === undefined ? {} : { operations: operations.map(toServerOperation) }),
    };
    const { status, body } = await post("/sync", payload, anonymousSessionId);
    if (status !== 200) throw retryableError(status, body);
    const { results, currentState, syncTimestamp } = body as WireSyncResponse;
    const progress: SyncProgressResponse = { results, currentState, syncTimestamp };
    return progress;
  }

  return { checkIn, claimReward, sync, batch: { sync } };
}
