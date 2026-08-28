import {
  type AdminRallyConfig,
  type CheckInCondition,
  consumeReward,
  evaluateConditionDetailed,
  reconcileRewardStates,
  type UserRallyState,
  type Validator,
  type VerificationContext,
} from "@stamprally/core";
import type {
  AuditLog,
  CheckInRequest,
  CheckInResponse,
  ClaimRewardRequest,
  ServerOptions,
} from "./index.js";
import type { ServerPersistenceAdapter } from "./persistence.js";

type ErrorResponse = { readonly ok: false; readonly code: string; readonly message: string };
type ClaimResponse =
  | { readonly ok: true; readonly state: UserRallyState; readonly claimTicketNumber?: string }
  | ErrorResponse;
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requestId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}
function now(options: ServerOptions, requested?: string): string {
  return requested ?? options.now?.() ?? new Date().toISOString();
}
function initialState(config: AdminRallyConfig, userId: string, timestamp: string): UserRallyState {
  return {
    rallyId: config.id,
    userId,
    records: [],
    rewards: reconcileRewardStates(config.rewards, [], 0, timestamp),
    updatedAt: timestamp,
  };
}
function getProof(context: VerificationContext): unknown {
  return context.type === "qr"
    ? context.token
    : context.type === "passcode"
      ? context.code
      : context.type === "gps"
        ? { latitude: context.latitude, longitude: context.longitude }
        : context.type === "nfc"
          ? context.tagId
          : context.value;
}
async function evaluate(
  condition: CheckInCondition,
  context: VerificationContext,
  validator: Validator | undefined,
  base: { rallyId: string; spotId: string; state: UserRallyState },
): Promise<boolean> {
  if (condition.type !== "custom") return evaluateConditionDetailed(condition, context).ok;
  if (validator === undefined) return false;
  const validationContext = {
    rallyId: base.rallyId,
    spotId: base.spotId,
    proofData: getProof(context),
    condition,
    userState: base.state,
  };
  const result =
    typeof validator === "function"
      ? await validator(validationContext)
      : await validator.validate(validationContext);
  return result === true || (typeof result === "object" && result.valid);
}
function audit(
  rallyId: string,
  userId: string,
  action: AuditLog["action"],
  resourceId: string,
  key: string,
  status: AuditLog["status"],
  timestamp: string,
  code?: string,
): AuditLog {
  return {
    id: requestId("audit"),
    timestamp,
    rallyId,
    userId,
    action,
    resourceId,
    status,
    idempotencyKey: key,
    ...(code === undefined ? {} : { metadata: { errorCode: code } }),
  };
}

export class StampRallyServer {
  readonly #config: AdminRallyConfig;
  readonly #persistence: ServerPersistenceAdapter;
  readonly #options: ServerOptions;
  constructor(
    config: AdminRallyConfig,
    persistence: ServerPersistenceAdapter,
    options: ServerOptions = {},
  ) {
    this.#config = config;
    this.#persistence = persistence;
    this.#options = options;
  }
  async handle(request: Request): Promise<Response> {
    if (request.method !== "POST")
      return json({ ok: false, code: "METHOD_NOT_ALLOWED", message: "POST is required." }, 405);
    const path = new URL(request.url).pathname;
    if (path.endsWith("/check-in")) return this.handleCheckIn(request);
    if (path.endsWith("/claim-reward")) return this.handleClaimReward(request);
    if (path.endsWith("/sync")) return this.handleSync(request);
    return json({ ok: false, code: "NOT_FOUND", message: "Route not found." }, 404);
  }
  async handleCheckIn(request: Request): Promise<Response> {
    const body = await this.#body<CheckInRequest>(request);
    const userId = await this.#user(request, body?.userId);
    if (
      body === null ||
      userId === null ||
      body.rallyId !== this.#config.id ||
      body.spotId === "" ||
      body.idempotencyKey === "" ||
      body.context === undefined
    )
      return json(
        {
          ok: false,
          code: "INVALID_REQUEST",
          message: "rallyId, spotId, context, and idempotencyKey are required.",
        },
        400,
      );
    const result = await this.checkIn({ ...body, userId });
    return json(result, result.ok ? 200 : result.code === "SPOT_NOT_FOUND" ? 404 : 422);
  }
  async handleClaimReward(request: Request): Promise<Response> {
    const body = await this.#body<ClaimRewardRequest>(request);
    const userId = await this.#user(request, body?.userId);
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
          code: "INVALID_REQUEST",
          message: "rallyId, rewardId, and idempotencyKey are required.",
        },
        400,
      );
    const result = await this.claimReward({ ...body, userId });
    return json(result, result.ok ? 200 : result.code === "REWARD_NOT_FOUND" ? 404 : 422);
  }
  async handleSync(request: Request): Promise<Response> {
    const body = await this.#body<{ readonly rallyId: string; readonly userId?: string }>(request);
    const userId = await this.#user(request, body?.userId);
    if (body === null || userId === null || body.rallyId !== this.#config.id)
      return json({ ok: false, code: "INVALID_REQUEST", message: "rallyId is required." }, 400);
    return json({ ok: true, state: await this.sync(body.rallyId, userId) });
  }
  async checkIn(request: CheckInRequest & { readonly userId: string }): Promise<CheckInResponse> {
    const key = `check-in:${request.rallyId}:${request.userId}:${request.idempotencyKey}`;
    const previous = await this.#persistence.getIdempotentResult<CheckInResponse>(
      request.rallyId,
      key,
    );
    if (previous !== null) return previous;
    const lockKey = `state:${request.rallyId}:${request.userId}`;
    if (
      !(await this.#persistence.acquireLock(
        request.rallyId,
        lockKey,
        this.#options.lockTtlMs ?? 5_000,
      ))
    )
      return { ok: false, code: "CONFLICT", message: "The user state is being updated." };
    const timestamp = now(this.#options, request.now);
    try {
      const spot = this.#config.spots.find((item) => item.id === request.spotId);
      if (spot === undefined)
        return this.#remember(
          key,
          { ok: false, code: "SPOT_NOT_FOUND", message: "Spot was not found." },
          request.rallyId,
          request.userId,
          "CHECK_IN",
          request.spotId,
          request.idempotencyKey,
          timestamp,
        );
      const current =
        (await this.#persistence.getUserState(request.rallyId, request.userId)) ??
        initialState(this.#config, request.userId, timestamp);
      if (current.records.some((record) => record.stampId === request.spotId))
        return this.#remember(
          key,
          { ok: false, code: "STAMP_ALREADY_ACQUIRED", message: "Spot was already claimed." },
          request.rallyId,
          request.userId,
          "CHECK_IN",
          request.spotId,
          request.idempotencyKey,
          timestamp,
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
          request.rallyId,
          request.userId,
          "CHECK_IN",
          request.spotId,
          request.idempotencyKey,
          timestamp,
        );
      for (const condition of spot.conditions)
        if (
          !(await evaluate(
            condition,
            request.context,
            condition.type === "custom"
              ? this.#options.customValidators?.[condition.validatorName]
              : undefined,
            { rallyId: request.rallyId, spotId: request.spotId, state: current },
          ))
        )
          return this.#remember(
            key,
            { ok: false, code: "INVALID_PROOF", message: "Verification failed." },
            request.rallyId,
            request.userId,
            "CHECK_IN",
            request.spotId,
            request.idempotencyKey,
            timestamp,
          );
      const next: UserRallyState = {
        ...current,
        records: [...current.records, { stampId: request.spotId, acquiredAt: timestamp }],
        rewards: reconcileRewardStates(
          this.#config.rewards,
          current.rewards,
          current.records.length + 1,
          timestamp,
        ),
        updatedAt: timestamp,
      };
      await this.#persistence.saveUserState(request.rallyId, request.userId, next);
      return this.#remember(
        key,
        { ok: true, state: next },
        request.rallyId,
        request.userId,
        "CHECK_IN",
        request.spotId,
        request.idempotencyKey,
        timestamp,
      );
    } finally {
      await this.#persistence.releaseLock(request.rallyId, lockKey);
    }
  }
  async claimReward(
    request: ClaimRewardRequest & { readonly userId: string },
  ): Promise<ClaimResponse> {
    if (this.#persistence.runTransaction !== undefined)
      return this.#persistence.runTransaction(request.rallyId, (transaction) =>
        this.#claimRewardMutation(request, transaction),
      );
    return this.#claimRewardMutation(request, this.#persistence);
  }
  async #claimRewardMutation(
    request: ClaimRewardRequest & { readonly userId: string },
    persistence: ServerPersistenceAdapter,
  ): Promise<ClaimResponse> {
    const key = `claim:${request.rallyId}:${request.userId}:${request.rewardId}:${request.idempotencyKey}`;
    const previous = await persistence.getIdempotentResult<ClaimResponse>(request.rallyId, key);
    if (previous !== null) return previous;
    const reward = this.#config.rewards.find((item) => item.id === request.rewardId);
    if (reward === undefined)
      return this.#rememberClaim(
        key,
        { ok: false, code: "REWARD_NOT_FOUND", message: "Reward was not found." },
        request,
        now(this.#options, request.now),
        persistence,
      );
    const lockKey = `reward:${request.rallyId}:${reward.id}`;
    if (
      !(await persistence.acquireLock(request.rallyId, lockKey, this.#options.lockTtlMs ?? 5_000))
    )
      return { ok: false, code: "CONFLICT", message: "The reward is being claimed." };
    const timestamp = now(this.#options, request.now);
    let decremented = false;
    let previousState: UserRallyState | null = null;
    let recordedTicket: string | null = null;
    let successAuditId: string | null = null;
    try {
      const checked = await persistence.getIdempotentResult<ClaimResponse>(request.rallyId, key);
      if (checked !== null) return checked;
      const storedState = await persistence.getUserState(request.rallyId, request.userId);
      previousState = storedState;
      const current = storedState ?? initialState(this.#config, request.userId, timestamp);
      const claimCount = await persistence.getUserClaimCount(
        request.rallyId,
        request.userId,
        reward.id,
      );
      const storedReward = current.rewards.find((item) => item.rewardId === reward.id) ?? {
        rewardId: reward.id,
        status: "LOCKED" as const,
      };
      const currentReward =
        reward.redemptionMethod === "server_claim" &&
        storedReward.status === "CONSUMED" &&
        (reward.userClaimLimit === undefined || claimCount < reward.userClaimLimit)
          ? { ...storedReward, status: "AVAILABLE" as const }
          : storedReward;
      const local = consumeReward({
        reward,
        currentState: currentReward,
        now: timestamp,
        userRedemptionCount: claimCount,
        ...(request.staffPasscode === undefined ? {} : { inputPasscode: request.staffPasscode }),
        ...(request.staffId === undefined ? {} : { staffId: request.staffId }),
      });
      if (!local.ok)
        return this.#rememberClaim(
          key,
          { ok: false, code: local.error.code, message: "Reward cannot be claimed." },
          request,
          timestamp,
          persistence,
        );
      const stock = await persistence.decrementRewardStock(request.rallyId, reward.id);
      if (!stock.success)
        return this.#rememberClaim(
          key,
          { ok: false, code: "OUT_OF_STOCK", message: "Reward is out of stock." },
          request,
          timestamp,
          persistence,
        );
      decremented = true;
      const next: UserRallyState = {
        ...current,
        rewards: current.rewards.map((item) => (item.rewardId === reward.id ? local.value : item)),
        updatedAt: timestamp,
      };
      try {
        await persistence.saveUserState(request.rallyId, request.userId, next);
        const response: ClaimResponse =
          local.value.claimTicketNumber === undefined
            ? { ok: true, state: next }
            : { ok: true, state: next, claimTicketNumber: local.value.claimTicketNumber };
        recordedTicket = local.value.claimTicketNumber ?? "";
        await persistence.recordUserClaim({
          rallyId: request.rallyId,
          userId: request.userId,
          rewardId: reward.id,
          ticketNumber: recordedTicket,
          timestamp: Number.isNaN(Date.parse(timestamp)) ? Date.now() : Date.parse(timestamp),
        });
        const successAudit = audit(
          request.rallyId,
          request.userId,
          "CLAIM_REWARD",
          reward.id,
          request.idempotencyKey,
          "SUCCESS",
          timestamp,
        );
        successAuditId = successAudit.id;
        await persistence.recordAuditLog(successAudit);
        await persistence.saveIdempotentResult(
          request.rallyId,
          key,
          response,
          this.#options.idempotencyTtlMs ?? 86_400_000,
        );
        return response;
      } catch (error) {
        if (recordedTicket !== null && persistence.rollbackUserClaim !== undefined)
          await persistence.rollbackUserClaim(
            request.rallyId,
            request.userId,
            reward.id,
            recordedTicket,
          );
        if (persistence.rollbackUserState !== undefined)
          await persistence.rollbackUserState(request.rallyId, request.userId, previousState);
        if (successAuditId !== null && persistence.removeAuditLog !== undefined)
          await persistence.removeAuditLog(successAuditId);
        await this.#restoreRewardStock(persistence, request.rallyId, reward.id);
        decremented = false;
        throw error;
      }
    } catch (error) {
      if (decremented) await this.#restoreRewardStock(persistence, request.rallyId, reward.id);
      return {
        ok: false,
        code: "PERSISTENCE_FAILED",
        message: error instanceof Error ? error.message : "Reward claim failed.",
      };
    } finally {
      await persistence.releaseLock(request.rallyId, lockKey);
    }
  }
  async sync(rallyId: string, userId: string): Promise<UserRallyState> {
    return (
      (await this.#persistence.getUserState(rallyId, userId)) ??
      initialState(this.#config, userId, now(this.#options))
    );
  }
  async #body<T>(request: Request): Promise<T | null> {
    try {
      const value: unknown = await request.json();
      return isObject(value) ? (value as T) : null;
    } catch {
      return null;
    }
  }
  async #user(request: Request, requested: string | undefined): Promise<string | null> {
    if (this.#options.authenticate !== undefined)
      return (await this.#options.authenticate(request)) ?? null;
    return requested ?? null;
  }
  async #remember(
    key: string,
    result: CheckInResponse,
    rallyId: string,
    userId: string,
    action: AuditLog["action"],
    resourceId: string,
    idempotencyKey: string,
    timestamp: string,
  ): Promise<CheckInResponse> {
    await this.#persistence.recordAuditLog(
      audit(
        rallyId,
        userId,
        action,
        resourceId,
        idempotencyKey,
        result.ok ? "SUCCESS" : "REJECTED",
        timestamp,
        result.ok ? undefined : result.code,
      ),
    );
    await this.#persistence.saveIdempotentResult(
      rallyId,
      key,
      result,
      this.#options.idempotencyTtlMs ?? 86_400_000,
    );
    return result;
  }
  async #rememberClaim(
    key: string,
    result: ClaimResponse,
    request: ClaimRewardRequest & { readonly userId: string },
    timestamp: string,
    persistence: ServerPersistenceAdapter = this.#persistence,
  ): Promise<ClaimResponse> {
    await persistence.recordAuditLog(
      audit(
        request.rallyId,
        request.userId,
        "CLAIM_REWARD",
        request.rewardId,
        request.idempotencyKey,
        "REJECTED",
        timestamp,
        result.ok ? undefined : result.code,
      ),
    );
    await persistence.saveIdempotentResult(
      request.rallyId,
      key,
      result,
      this.#options.idempotencyTtlMs ?? 86_400_000,
    );
    return result;
  }
  async #restoreRewardStock(
    persistence: ServerPersistenceAdapter,
    rallyId: string,
    rewardId: string,
  ): Promise<void> {
    if (persistence.restoreRewardStock !== undefined)
      await persistence.restoreRewardStock(rallyId, rewardId);
  }
}
