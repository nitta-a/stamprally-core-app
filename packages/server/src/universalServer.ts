import {
  type AdminRallyConfig,
  type AdminReward,
  consumeReward,
  type RewardItem,
  reconcileRewardStates,
  type StampRallyState,
  type VerificationCondition,
} from "@stamprally/core";
import type { RallyAuditLog, UserRallyState } from "./index.js";
import type { ServerPersistenceAdapter } from "./persistence.js";

export type UniversalVerificationContext =
  | { readonly type: "qr"; readonly token: string }
  | { readonly type: "passcode"; readonly code: string }
  | { readonly type: "gps"; readonly latitude: number; readonly longitude: number }
  | { readonly type: "custom"; readonly value: unknown };

export interface UniversalCheckInRequest {
  readonly rallyId: string;
  readonly userId: string;
  readonly spotId: string;
  readonly context: UniversalVerificationContext;
  readonly idempotencyKey: string;
  readonly now?: string;
}

export interface UniversalClaimRewardRequest {
  readonly rallyId: string;
  readonly userId: string;
  readonly rewardId: string;
  readonly idempotencyKey: string;
  readonly staffPasscode?: string;
  readonly staffId?: string;
  readonly now?: string;
}

export type UniversalCheckInResult =
  | { readonly ok: true; readonly state: UserRallyState }
  | { readonly ok: false; readonly code: string; readonly message: string };

export interface UniversalRallyServerOptions {
  readonly idempotencyTtlMs?: number;
  readonly lockTtlMs?: number;
  readonly customValidators?: Readonly<
    Record<string, (value: unknown, condition: VerificationCondition) => boolean>
  >;
  readonly now?: () => string;
  /** Extract the authenticated identity; request-body userId is never trusted when this is set. */
  readonly authenticate?: (request: Request) => Promise<string | null> | string | null;
}

function distanceMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const radians = (degrees: number): number => (degrees * Math.PI) / 180;
  const dLat = radians(bLat - aLat);
  const dLon = radians(bLon - aLon);
  const latA = radians(aLat);
  const latB = radians(bLat);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, value)));
}

function initialState(config: AdminRallyConfig, now: string): UserRallyState {
  return {
    rallyId: config.id,
    records: [],
    rewards: reconcileRewardStates(
      config.rewards.map((reward) => ({ ...reward, description: reward.description ?? "" })),
      [],
      0,
      now,
    ),
    updatedAt: now,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function requestBody<T>(request: Request): Promise<T | null> {
  return request
    .json()
    .then((value: unknown) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
      return value as T;
    })
    .catch(() => null);
}

function adminReward(reward: AdminReward): RewardItem {
  return { ...reward, description: reward.description ?? "" };
}

function matchesCondition(
  condition: VerificationCondition,
  context: UniversalVerificationContext,
  customValidators: UniversalRallyServerOptions["customValidators"],
): boolean {
  switch (condition.type) {
    case "qr":
      return context.type === "qr" && context.token === condition.secretToken;
    case "passcode":
      return (
        context.type === "passcode" &&
        (condition.caseSensitive === false
          ? context.code.toLocaleLowerCase() === condition.code.toLocaleLowerCase()
          : context.code === condition.code)
      );
    case "gps":
      return (
        context.type === "gps" &&
        distanceMeters(
          condition.latitude,
          condition.longitude,
          context.latitude,
          context.longitude,
        ) <= condition.radiusMeters
      );
    case "custom":
      return (
        customValidators?.[condition.validatorName]?.(
          context.type === "custom" ? context.value : undefined,
          condition,
        ) ?? false
      );
  }
}

function audit(
  request: UniversalCheckInRequest,
  status: RallyAuditLog["status"],
  now: string,
  errorCode?: string,
): RallyAuditLog {
  return {
    id: `audit-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
    timestamp: now,
    rallyId: request.rallyId,
    userId: request.userId,
    action: "CHECK_IN",
    resourceId: request.spotId,
    status,
    idempotencyKey: request.idempotencyKey,
    ...(errorCode === undefined ? {} : { metadata: { errorCode } }),
  };
}

/** Atomic, adapter-backed check-in service for the universal model. */
export class UniversalRallyServer {
  readonly #config: AdminRallyConfig;
  readonly #persistence: ServerPersistenceAdapter;
  readonly #options: UniversalRallyServerOptions;

  constructor(
    config: AdminRallyConfig,
    persistence: ServerPersistenceAdapter,
    options: UniversalRallyServerOptions = {},
  ) {
    this.#config = config;
    this.#persistence = persistence;
    this.#options = options;
  }

  /** Web Standard endpoint handler. Authentication, when configured, supplies the user identity. */
  async handleCheckIn(request: Request): Promise<Response> {
    const body = await requestBody<UniversalCheckInRequest>(request);
    const userId = await this.#authenticatedUser(request, body?.userId);
    if (this.#options.authenticate !== undefined && userId === null)
      return json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Authentication is required." } },
        401,
      );
    if (
      body === null ||
      userId === null ||
      body.rallyId !== this.#config.id ||
      body.spotId === "" ||
      body.idempotencyKey === ""
    )
      return json(
        {
          ok: false,
          error: {
            code: "INVALID_REQUEST",
            message: "rallyId, spotId, and idempotencyKey are required.",
          },
        },
        400,
      );
    if (body.context === undefined)
      return json(
        { ok: false, error: { code: "INVALID_REQUEST", message: "context is required." } },
        400,
      );
    const result = await this.checkIn({ ...body, userId });
    return result.ok ? json(result) : json(result, result.code === "SPOT_NOT_FOUND" ? 404 : 422);
  }

  async handleClaimReward(request: Request): Promise<Response> {
    const body = await requestBody<UniversalClaimRewardRequest>(request);
    const userId = await this.#authenticatedUser(request, body?.userId);
    if (this.#options.authenticate !== undefined && userId === null)
      return json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Authentication is required." } },
        401,
      );
    if (
      body === null ||
      userId === null ||
      body.rallyId !== this.#config.id ||
      body.rewardId === "" ||
      body.idempotencyKey === ""
    )
      return json(
        {
          ok: false,
          error: {
            code: "INVALID_REQUEST",
            message: "rallyId, rewardId, and idempotencyKey are required.",
          },
        },
        400,
      );
    const key = `claim-reward:${body.rallyId}:${userId}:${body.rewardId}:${body.idempotencyKey}`;
    const previous = await this.#persistence.getIdempotentResult<UniversalClaimRewardResponse>(key);
    if (previous !== null) return json(previous, previous.ok ? 200 : 422);
    const reward = this.#config.rewards.find((item) => item.id === body.rewardId);
    if (reward === undefined) {
      const failure: UniversalClaimRewardResponse = {
        ok: false,
        code: "REWARD_NOT_FOUND",
        message: "Reward was not found.",
      };
      return json(await this.#rememberClaim(key, failure, body, userId), 404);
    }
    const timestamp = body.now ?? this.#options.now?.() ?? new Date().toISOString();
    const current = await this.sync(body.rallyId, userId);
    const currentReward = current.rewards?.find((item) => item.rewardId === reward.id) ?? {
      rewardId: reward.id,
      status: "LOCKED" as const,
    };
    const userClaims = await this.#getUserClaimCount(userId, reward.id);
    const local = consumeReward({
      reward: adminReward(reward),
      currentState: currentReward,
      now: timestamp,
      userId,
      userRedemptionCount: userClaims,
      ...(body.staffPasscode === undefined ? {} : { inputPasscode: body.staffPasscode }),
      ...(body.staffId === undefined ? {} : { staffId: body.staffId }),
    });
    if (!local.ok)
      return json(
        await this.#rememberClaim(
          key,
          {
            ok: false,
            code: local.error.code,
            message: "Reward cannot be claimed.",
            error: local.error,
          },
          body,
          userId,
        ),
        422,
      );
    const stock = await this.#persistence.decrementRewardStock(reward.id);
    if (!stock.success)
      return json(
        await this.#rememberClaim(
          key,
          { ok: false, code: "OUT_OF_STOCK", message: "Reward is out of stock." },
          body,
          userId,
        ),
        422,
      );
    const next: UserRallyState = {
      ...current,
      rewards: (current.rewards ?? []).map((item) =>
        item.rewardId === reward.id ? local.value : item,
      ),
      updatedAt: timestamp,
    };
    await this.#persistence.saveUserState(body.rallyId, userId, next);
    const success: UniversalClaimRewardResponse =
      local.value.claimTicketNumber === undefined
        ? { ok: true, state: next }
        : { ok: true, state: next, claimTicketNumber: local.value.claimTicketNumber };
    await this.#persistence.saveIdempotentResult(
      key,
      success,
      this.#options.idempotencyTtlMs ?? 86_400_000,
    );
    await this.#persistence.recordAuditLog({
      id: `audit-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
      timestamp,
      rallyId: body.rallyId,
      userId,
      action: "CLAIM_REWARD",
      resourceId: reward.id,
      status: "SUCCESS",
      idempotencyKey: body.idempotencyKey,
    });
    return json(success);
  }

  async handleSync(request: Request): Promise<Response> {
    const body = await requestBody<{ readonly rallyId: string; readonly userId?: string }>(request);
    const userId = await this.#authenticatedUser(request, body?.userId);
    if (this.#options.authenticate !== undefined && userId === null)
      return json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Authentication is required." } },
        401,
      );
    if (body === null || userId === null || body.rallyId !== this.#config.id)
      return json(
        { ok: false, error: { code: "INVALID_REQUEST", message: "rallyId is required." } },
        400,
      );
    return json({ ok: true, state: await this.sync(body.rallyId, userId) });
  }

  async handle(request: Request): Promise<Response> {
    if (request.method !== "POST")
      return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405);
    const path = new URL(request.url).pathname;
    if (path.endsWith("/check-in")) return this.handleCheckIn(request);
    if (path.endsWith("/claim-reward")) return this.handleClaimReward(request);
    if (path.endsWith("/sync")) return this.handleSync(request);
    return json({ ok: false, error: { code: "NOT_FOUND" } }, 404);
  }

  async checkIn(request: UniversalCheckInRequest): Promise<UniversalCheckInResult> {
    const key = `check-in:${request.rallyId}:${request.userId}:${request.idempotencyKey}`;
    const previous = await this.#persistence.getIdempotentResult<UniversalCheckInResult>(key);
    if (previous !== null) return previous;
    const lockKey = `state:${request.rallyId}:${request.userId}`;
    const locked = await this.#persistence.acquireLock(lockKey, this.#options.lockTtlMs ?? 5000);
    if (!locked)
      return { ok: false, code: "CONFLICT", message: "The user state is being updated." };
    const now = request.now ?? this.#options.now?.() ?? new Date().toISOString();
    try {
      const spot = this.#config.spots.find((item) => item.id === request.spotId);
      if (spot === undefined)
        return this.#remember(
          key,
          { ok: false, code: "SPOT_NOT_FOUND", message: "Spot was not found." },
          request,
          now,
        );
      const current =
        (await this.#persistence.getUserState(request.rallyId, request.userId)) ??
        initialState(this.#config, now);
      if (current.records.some((record) => record.stampId === request.spotId))
        return this.#remember(
          key,
          { ok: false, code: "ALREADY_CLAIMED", message: "Spot was already claimed." },
          request,
          now,
        );
      const acquired = new Set(current.records.map((record) => record.stampId));
      if (spot.prerequisites?.some((id) => !acquired.has(id)))
        return this.#remember(
          key,
          {
            ok: false,
            code: "PREREQUISITES_NOT_MET",
            message: "Prerequisite spots are not complete.",
          },
          request,
          now,
        );
      if (
        !spot.conditions.every((condition) =>
          matchesCondition(condition, request.context, this.#options.customValidators),
        )
      )
        return this.#remember(
          key,
          { ok: false, code: "INVALID_PROOF", message: "Verification failed." },
          request,
          now,
        );
      const state: UserRallyState = {
        ...current,
        records: [...current.records, { stampId: request.spotId, acquiredAt: now }],
        updatedAt: now,
      };
      await this.#persistence.saveUserState(request.rallyId, request.userId, state);
      return this.#remember(key, { ok: true, state }, request, now);
    } finally {
      await this.#persistence.releaseLock(lockKey);
    }
  }

  async sync(rallyId: string, userId: string): Promise<UserRallyState> {
    const now = this.#options.now?.() ?? new Date().toISOString();
    return (
      (await this.#persistence.getUserState(rallyId, userId)) ?? initialState(this.#config, now)
    );
  }

  async #authenticatedUser(
    request: Request,
    requestedUserId: string | undefined,
  ): Promise<string | null> {
    const authenticated = await this.#options.authenticate?.(request);
    if (this.#options.authenticate !== undefined) return authenticated ?? null;
    return requestedUserId ?? null;
  }

  async #getUserClaimCount(userId: string, rewardId: string): Promise<number> {
    const state = await this.#persistence.getUserState(this.#config.id, userId);
    return state?.rewards?.find((item) => item.rewardId === rewardId)?.userRedemptionCount ?? 0;
  }

  async #rememberClaim(
    key: string,
    result: UniversalClaimRewardResponse,
    request: UniversalClaimRewardRequest,
    userId: string,
  ): Promise<UniversalClaimRewardResponse> {
    await this.#persistence.saveIdempotentResult(
      key,
      result,
      this.#options.idempotencyTtlMs ?? 86_400_000,
    );
    await this.#persistence.recordAuditLog({
      id: `audit-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
      timestamp: request.now ?? this.#options.now?.() ?? new Date().toISOString(),
      rallyId: request.rallyId,
      userId,
      action: "CLAIM_REWARD",
      resourceId: request.rewardId,
      status: "REJECTED",
      idempotencyKey: request.idempotencyKey,
    });
    return result;
  }

  async #remember(
    key: string,
    result: UniversalCheckInResult,
    request: UniversalCheckInRequest,
    now: string,
  ): Promise<UniversalCheckInResult> {
    await this.#persistence.recordAuditLog(
      audit(request, result.ok ? "SUCCESS" : "REJECTED", now, result.ok ? undefined : result.code),
    );
    await this.#persistence.saveIdempotentResult(
      key,
      result,
      this.#options.idempotencyTtlMs ?? 86_400_000,
    );
    return result;
  }
}

type UniversalClaimRewardResponse =
  | { readonly ok: true; readonly state: UserRallyState; readonly claimTicketNumber?: string }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
      readonly error?: unknown;
    };

export type { StampRallyState };
