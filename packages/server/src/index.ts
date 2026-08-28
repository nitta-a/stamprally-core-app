import {
  consumeReward,
  createSecureToken,
  processStamp,
  type RallyConfig,
  type RewardConsumeError,
  reconcileRewardStates,
  type SecureTokenSecretKey,
  type StampError,
  type StampRallyState,
  type StampRecord,
  type VerificationContext,
} from "@stamprally/core";

export interface UserRallyState extends StampRallyState {
  readonly userId?: string;
}

export interface RallyAuditLog {
  readonly id: string;
  readonly timestamp: string;
  readonly rallyId: string;
  readonly userId: string;
  readonly action: "CHECK_IN" | "CLAIM_REWARD";
  readonly resourceId: string;
  readonly status: "SUCCESS" | "REJECTED";
  readonly idempotencyKey: string;
  readonly proofData?: unknown;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ServerStorageAdapter {
  getRewardStock(rewardId: string): Promise<number | null>;
  decrementRewardStock(rewardId: string): Promise<boolean>;
  getUserClaims(userId: string, rewardId: string): Promise<number>;
  recordAuditLog(log: RallyAuditLog): Promise<void>;
  saveUserState(userId: string, state: UserRallyState): Promise<void>;
  getUserState(userId: string): Promise<UserRallyState | null>;
}

export interface AdminRallyConfig extends RallyConfig {
  readonly secretKey: SecureTokenSecretKey;
  readonly proofTtlSeconds?: number;
  readonly authenticate?: (request: Request) => Promise<string | null> | string | null;
}

export interface CheckInRequest {
  readonly userId: string;
  readonly spotId: string;
  readonly claimMethod: string;
  readonly proofData?: unknown;
  readonly idempotencyKey: string;
}

export interface ClaimRewardRequest {
  readonly userId: string;
  readonly rewardId: string;
  readonly staffPasscode?: string;
  readonly idempotencyKey: string;
  readonly staffId?: string;
}

export interface SyncRequest {
  readonly userId: string;
  readonly queue?: ReadonlyArray<SyncCheckInOperation>;
  readonly operations?: ReadonlyArray<SyncCheckInOperation>;
}

export interface SyncCheckInOperation {
  readonly userId?: string;
  readonly spotId?: string;
  readonly stampId?: string;
  readonly claimMethod?: string;
  readonly proofData?: unknown;
  readonly context?: VerificationContext;
  readonly idempotencyKey: string;
}

export interface StampClaimProof {
  readonly token: string;
  readonly rallyId: string;
  readonly userId: string;
  readonly spotId: string;
  readonly acquiredAt: string;
}

export interface InMemoryServerStorageOptions {
  readonly stocks?: Readonly<Record<string, number>>;
}

export class InMemoryServerStorage implements ServerStorageAdapter {
  readonly #states = new Map<string, UserRallyState>();
  readonly #stocks: Map<string, number>;
  readonly #claims = new Map<string, number>();
  readonly #auditLogs: RallyAuditLog[] = [];

  constructor(options: InMemoryServerStorageOptions = {}) {
    this.#stocks = new Map(Object.entries(options.stocks ?? {}));
  }

  async getRewardStock(rewardId: string): Promise<number | null> {
    return this.#stocks.get(rewardId) ?? null;
  }

  async decrementRewardStock(rewardId: string): Promise<boolean> {
    const stock = this.#stocks.get(rewardId);
    if (stock === undefined) return true;
    if (stock <= 0) return false;
    this.#stocks.set(rewardId, stock - 1);
    return true;
  }

  async getUserClaims(userId: string, rewardId: string): Promise<number> {
    return this.#claims.get(`${userId}:${rewardId}`) ?? 0;
  }

  async recordAuditLog(log: RallyAuditLog): Promise<void> {
    this.#auditLogs.push({ ...log });
  }

  async saveUserState(userId: string, state: UserRallyState): Promise<void> {
    this.#states.set(userId, cloneUserState(state));
  }

  async getUserState(userId: string): Promise<UserRallyState | null> {
    const state = this.#states.get(userId);
    return state === undefined ? null : cloneUserState(state);
  }

  getAuditLogs(): ReadonlyArray<RallyAuditLog> {
    return this.#auditLogs.map((log) => ({ ...log }));
  }

  recordClaim(userId: string, rewardId: string): void {
    const key = `${userId}:${rewardId}`;
    this.#claims.set(key, (this.#claims.get(key) ?? 0) + 1);
  }
}

function cloneUserState(state: UserRallyState): UserRallyState {
  return {
    ...state,
    records: state.records.map((record) => ({
      ...record,
      ...(record.metadata === undefined ? {} : { metadata: { ...record.metadata } }),
    })),
    ...(state.rewards === undefined
      ? {}
      : { rewards: state.rewards.map((reward) => ({ ...reward })) }),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function errorResponse(code: string, message: string, status: number): Response {
  return jsonResponse({ ok: false, error: { code, message } }, status);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function contextForClaim(method: string, proofData: unknown): VerificationContext {
  if (method === "token" || method === "qr" || method === "passcode") {
    return {
      type: "token",
      token:
        isObject(proofData) && typeof proofData.token === "string"
          ? proofData.token
          : String(proofData ?? ""),
    };
  }
  if (method === "geo" || method === "geolocation") {
    const value = isObject(proofData) ? proofData : {};
    return {
      type: "geo",
      currentLatitude:
        typeof value.latitude === "number"
          ? value.latitude
          : typeof value.currentLatitude === "number"
            ? value.currentLatitude
            : Number.NaN,
      currentLongitude:
        typeof value.longitude === "number"
          ? value.longitude
          : typeof value.currentLongitude === "number"
            ? value.currentLongitude
            : Number.NaN,
    };
  }
  return { type: "instant" };
}

function now(): string {
  return new Date().toISOString();
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function safeProofData(value: unknown): unknown {
  return isObject(value) && typeof value.token === "string" ? { type: "token" } : value;
}

function proofFromContext(context: VerificationContext | undefined): unknown {
  if (context?.type === "token") return { token: context.token };
  if (context?.type === "geo") {
    return { latitude: context.currentLatitude, longitude: context.currentLongitude };
  }
  return undefined;
}

function id(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export class StampRallyServer {
  readonly #config: AdminRallyConfig;
  readonly #storage: ServerStorageAdapter;
  readonly #idempotent = new Map<string, Response>();
  readonly #claims = new Map<string, number>();
  #queue: Promise<unknown> = Promise.resolve();

  constructor(config: AdminRallyConfig, storage: ServerStorageAdapter) {
    this.#config = config;
    this.#storage = storage;
  }

  handle(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method !== "POST")
      return Promise.resolve(errorResponse("METHOD_NOT_ALLOWED", "POST is required.", 405));
    if (path.endsWith("/check-in")) return this.verifyCheckIn(request);
    if (path.endsWith("/claim-reward")) return this.claimReward(request);
    if (path.endsWith("/sync")) return this.syncProgress(request);
    return Promise.resolve(errorResponse("NOT_FOUND", "Route not found.", 404));
  }

  verifyCheckIn(request: Request): Promise<Response> {
    return this.#enqueue(() => this.#verifyCheckIn(request));
  }

  claimReward(request: Request): Promise<Response> {
    return this.#enqueue(() => this.#claimReward(request));
  }

  syncProgress(request: Request): Promise<Response> {
    return this.#enqueue(() => this.#syncProgress(request));
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.#queue.then(operation, operation);
    this.#queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async #authenticate(request: Request): Promise<string | null> {
    return this.#config.authenticate === undefined ? null : this.#config.authenticate(request);
  }

  async #parse<T>(request: Request): Promise<T | null> {
    try {
      const value: unknown = await request.json();
      return isObject(value) ? (value as T) : null;
    } catch {
      return null;
    }
  }

  async #verifyCheckIn(request: Request): Promise<Response> {
    const authenticatedUser = await this.#authenticate(request);
    const body = await this.#parse<CheckInRequest>(request);
    const userId = body?.userId ?? authenticatedUser;
    if (
      userId === null ||
      userId === undefined ||
      body === null ||
      !hasText(userId) ||
      !hasText(body.spotId) ||
      !hasText(body.claimMethod) ||
      !hasText(body.idempotencyKey)
    ) {
      return errorResponse(
        "INVALID_REQUEST",
        "userId, spotId, and idempotencyKey are required.",
        400,
      );
    }
    if (authenticatedUser !== null && authenticatedUser !== userId)
      return errorResponse("UNAUTHORIZED", "User identity does not match authentication.", 401);
    const key = `check-in:${userId}:${body.idempotencyKey}`;
    const previous = this.#idempotent.get(key);
    if (previous !== undefined) return previous.clone();
    const timestamp = now();
    const current =
      (await this.#storage.getUserState(userId)) ?? emptyState(this.#config, timestamp);
    const result = processStamp(
      current,
      this.#config,
      body.spotId,
      contextForClaim(body.claimMethod, body.proofData),
      timestamp,
    );
    if (!result.ok) {
      await this.#audit(
        userId,
        "CHECK_IN",
        body.spotId,
        body.idempotencyKey,
        "REJECTED",
        safeProofData(body.proofData),
        result.error,
      );
      return this.#remember(key, jsonResponse({ ok: false, error: result.error }, 422));
    }
    const ttl = this.#config.proofTtlSeconds ?? 3600;
    const token = await createSecureToken(
      {
        type: "stamp_claim",
        rallyId: this.#config.id,
        userId,
        spotId: body.spotId,
        acquiredAt: timestamp,
        exp: Math.floor(Date.now() / 1000) + ttl,
      },
      this.#config.secretKey,
      { encrypt: true },
    );
    await this.#storage.saveUserState(userId, result.value.nextState);
    await this.#audit(
      userId,
      "CHECK_IN",
      body.spotId,
      body.idempotencyKey,
      "SUCCESS",
      safeProofData(body.proofData),
    );
    return this.#remember(
      key,
      jsonResponse({
        ok: true,
        state: result.value.nextState,
        proof: {
          token,
          rallyId: this.#config.id,
          userId,
          spotId: body.spotId,
          acquiredAt: timestamp,
        },
      }),
    );
  }

  async #claimReward(request: Request): Promise<Response> {
    const authenticatedUser = await this.#authenticate(request);
    const body = await this.#parse<ClaimRewardRequest>(request);
    const userId = body?.userId ?? authenticatedUser;
    if (
      userId === null ||
      userId === undefined ||
      body === null ||
      !hasText(userId) ||
      !hasText(body.rewardId) ||
      !hasText(body.idempotencyKey)
    )
      return errorResponse(
        "INVALID_REQUEST",
        "userId, rewardId, and idempotencyKey are required.",
        400,
      );
    if (authenticatedUser !== null && authenticatedUser !== userId)
      return errorResponse("UNAUTHORIZED", "User identity does not match authentication.", 401);
    const key = `claim-reward:${userId}:${body.rewardId}:${body.idempotencyKey}`;
    const previous = this.#idempotent.get(key);
    if (previous !== undefined) return previous.clone();
    const reward = this.#config.rewards?.find((item) => item.id === body.rewardId);
    if (reward === undefined) {
      await this.#audit(userId, "CLAIM_REWARD", body.rewardId, body.idempotencyKey, "REJECTED");
      return this.#remember(key, errorResponse("REWARD_NOT_FOUND", "Reward was not found.", 404));
    }
    const timestamp = now();
    const current =
      (await this.#storage.getUserState(userId)) ?? emptyState(this.#config, timestamp);
    const rewardState = current.rewards?.find((item) => item.rewardId === reward.id);
    if (rewardState === undefined) {
      await this.#audit(userId, "CLAIM_REWARD", reward.id, body.idempotencyKey, "REJECTED");
      return this.#remember(key, errorResponse("NOT_AVAILABLE", "Reward is not available.", 422));
    }
    const userClaims = Math.max(
      await this.#storage.getUserClaims(userId, reward.id),
      this.#claims.get(`${userId}:${reward.id}`) ?? 0,
    );
    const stock = await this.#storage.getRewardStock(reward.id);
    const userLimit = reward.userClaimLimit ?? reward.limitPerUser;
    const canReclaimServerReward =
      reward.redemptionMethod === "server_claim" &&
      (userLimit === undefined || userClaims < userLimit) &&
      (stock === null || stock > 0);
    const claimableState =
      canReclaimServerReward && rewardState.status === "CONSUMED"
        ? { ...rewardState, status: "AVAILABLE" as const }
        : rewardState;
    const local = consumeReward({
      reward,
      currentState: claimableState,
      now: timestamp,
      ...(body.staffPasscode === undefined ? {} : { inputPasscode: body.staffPasscode }),
      ...(body.staffId === undefined ? {} : { staffId: body.staffId }),
      userId,
      userRedemptionCount: userClaims,
    });
    if (!local.ok)
      return this.#remember(
        key,
        await this.#rewardError(userId, reward.id, body.idempotencyKey, local.error),
      );
    if (stock !== null && !(await this.#storage.decrementRewardStock(reward.id)))
      return this.#remember(
        key,
        await this.#rewardError(userId, reward.id, body.idempotencyKey, {
          code: "OUT_OF_STOCK",
          rewardId: reward.id,
        }),
      );
    const nextState: StampRallyState = {
      ...current,
      rewards: (current.rewards ?? []).map((item) =>
        item.rewardId === reward.id ? local.value : item,
      ),
      updatedAt: timestamp,
    };
    await this.#storage.saveUserState(userId, nextState);
    const claimKey = `${userId}:${reward.id}`;
    this.#claims.set(claimKey, userClaims + 1);
    if (this.#storage instanceof InMemoryServerStorage)
      this.#storage.recordClaim(userId, reward.id);
    await this.#audit(userId, "CLAIM_REWARD", reward.id, body.idempotencyKey, "SUCCESS", {
      staffId: body.staffId,
    });
    return this.#remember(
      key,
      jsonResponse({
        ok: true,
        state: nextState,
        claimTicketNumber: local.value.claimTicketNumber,
      }),
    );
  }

  async #rewardError(
    userId: string,
    rewardId: string,
    key: string,
    error: RewardConsumeError,
  ): Promise<Response> {
    await this.#audit(userId, "CLAIM_REWARD", rewardId, key, "REJECTED", undefined, error);
    return jsonResponse({ ok: false, error }, 422);
  }

  async #syncProgress(request: Request): Promise<Response> {
    const authenticatedUser = await this.#authenticate(request);
    const body = await this.#parse<SyncRequest>(request);
    if (body === null || body.userId === undefined)
      return errorResponse("INVALID_REQUEST", "userId is required.", 400);
    if (authenticatedUser !== null && authenticatedUser !== body.userId)
      return errorResponse("UNAUTHORIZED", "User identity does not match authentication.", 401);
    const queue = body.queue ?? body.operations ?? [];
    for (const operation of queue) {
      const userId = operation.userId ?? body.userId;
      const spotId = operation.spotId ?? operation.stampId;
      const claimMethod = operation.claimMethod ?? operation.context?.type;
      if (!hasText(userId) || !hasText(spotId) || !hasText(claimMethod)) continue;
      const synthetic = new Request(new URL("/api/check-in", request.url), {
        method: "POST",
        body: JSON.stringify({
          userId,
          spotId,
          claimMethod,
          proofData: operation.proofData ?? proofFromContext(operation.context),
          idempotencyKey: operation.idempotencyKey,
        }),
        headers: { "content-type": "application/json" },
      });
      await this.#verifyCheckIn(synthetic);
    }
    const timestamp = now();
    const state =
      (await this.#storage.getUserState(body.userId)) ?? emptyState(this.#config, timestamp);
    await this.#storage.saveUserState(body.userId, state);
    return jsonResponse({ ok: true, state, accepted: queue.length });
  }

  async #audit(
    userId: string,
    action: RallyAuditLog["action"],
    resourceId: string,
    idempotencyKey: string,
    status: RallyAuditLog["status"],
    proofData?: unknown,
    error?: unknown,
  ): Promise<void> {
    await this.#storage.recordAuditLog({
      id: id("audit"),
      timestamp: now(),
      rallyId: this.#config.id,
      userId,
      action,
      resourceId,
      status,
      idempotencyKey,
      ...(proofData === undefined ? {} : { proofData }),
      ...(error === undefined
        ? {}
        : {
            metadata: {
              errorCode: isObject(error) && typeof error.code === "string" ? error.code : "UNKNOWN",
            },
          }),
    });
  }

  #remember(key: string, response: Response): Response {
    this.#idempotent.set(key, response.clone());
    return response;
  }
}

function emptyState(config: RallyConfig, timestamp: string): UserRallyState {
  return {
    rallyId: config.id,
    records: [],
    ...(config.rewards === undefined
      ? {}
      : { rewards: reconcileRewardStates(config.rewards, [], 0, timestamp) }),
    updatedAt: timestamp,
  };
}

export type { InMemoryServerPersistenceOptions, ServerPersistenceAdapter } from "./persistence.js";
export { InMemoryServerPersistenceAdapter } from "./persistence.js";
export type {
  UniversalCheckInRequest,
  UniversalCheckInResult,
  UniversalClaimRewardRequest,
  UniversalRallyServerOptions,
  UniversalVerificationContext,
} from "./universalServer.js";
export { UniversalRallyServer } from "./universalServer.js";
export type { StampError, StampRecord };
