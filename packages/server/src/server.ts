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
  SyncOperationStatus,
} from "./index.js";
import type { ServerPersistenceAdapter } from "./persistence.js";
import {
  assertValidCheckInParams,
  assertValidClaimParams,
  assertValidSyncParams,
  RequestValidationException,
  validateCheckInRequest,
  validateClaimRewardRequest,
  validateSyncRequest,
} from "./security.js";
import type { TrustedAuthContext } from "./types.js";

type ErrorResponse = { readonly ok: false; readonly code: string; readonly message: string };
type ClaimResponse =
  | {
      readonly ok: true;
      readonly state: UserRallyState;
      readonly claimTicketNumber?: string;
      readonly inventory?: InventoryStatus;
    }
  | ErrorResponse;
interface InventoryStatus {
  readonly sharedRemaining?: number;
  readonly rewardRemaining?: number;
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function requestId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}
function now(options: ServerOptions): string {
  return options.now?.() ?? new Date().toISOString();
}
function timestampMillis(timestamp: string): number {
  const value = Date.parse(timestamp);
  return Number.isFinite(value) ? value : Date.now();
}
function validationResponse(
  errors: ReadonlyArray<{ readonly path: string; readonly message: string; readonly code: string }>,
): Response {
  return json(
    {
      error: "VALIDATION_FAILED",
      details: errors.map(({ path, message, code }) => ({ path, message, code })),
    },
    400,
  );
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
interface InventoryPlan {
  readonly primaryKey: string;
  readonly primaryInitial: number | null;
  readonly secondaryKey?: string;
  readonly secondaryInitial?: number | null;
}
function rewardStock(
  config: AdminRallyConfig,
  reward: AdminRallyConfig["rewards"][number],
): number | null {
  const stockLimit = reward.stockLimit;
  const key = reward.stockKey ?? reward.id;
  const configured = key === "__shared__" ? config.inventory?.sharedStock : config.inventory?.[key];
  if (stockLimit === undefined) return configured ?? null;
  if (configured === undefined) return stockLimit;
  return Math.min(stockLimit, configured);
}
function sharedStock(config: AdminRallyConfig): number | null {
  return config.inventory?.sharedStock ?? null;
}
function inventoryPlan(
  config: AdminRallyConfig,
  rewardId: string,
  stockLimit: number | undefined,
): InventoryPlan {
  const reward = config.rewards.find((item) => item.id === rewardId);
  const individual = reward === undefined ? (stockLimit ?? null) : rewardStock(config, reward);
  const shared = sharedStock(config);
  const explicitPrimaryKey = reward?.stockKey;
  const explicitSecondaryKey = reward?.secondaryStockKey;
  if (config.inventoryMode === "shared" && shared !== null) {
    return {
      primaryKey: explicitPrimaryKey ?? "__shared__",
      primaryInitial: explicitPrimaryKey === undefined ? shared : individual,
      ...(explicitSecondaryKey !== undefined
        ? {
            secondaryKey: explicitSecondaryKey,
            secondaryInitial: config.inventory?.[explicitSecondaryKey] ?? individual,
          }
        : individual === null
          ? {}
          : { secondaryKey: rewardId, secondaryInitial: individual }),
    };
  }
  return {
    primaryKey: explicitPrimaryKey ?? rewardId,
    primaryInitial: individual,
    ...(explicitSecondaryKey === undefined
      ? {}
      : {
          secondaryKey: explicitSecondaryKey,
          secondaryInitial: config.inventory?.[explicitSecondaryKey] ?? null,
        }),
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
function operationStatus(result: {
  readonly ok: boolean;
  readonly code?: string;
}): SyncOperationStatus {
  if (result.ok) return "ACCEPTED";
  return result.code === "CONFLICT" || result.code === "PERSISTENCE_FAILED"
    ? "RETRYABLE_ERROR"
    : "REJECTED_PERMANENT";
}

function withDirectIdentity<
  T extends { readonly userId?: string; readonly anonymousSessionId?: string },
>(request: T, authContext?: TrustedAuthContext): T & { readonly userId: string } {
  if (authContext !== undefined) {
    if (authContext.authenticatedUserId.trim() === "")
      throw new RequestValidationException([
        {
          path: "authContext.authenticatedUserId",
          message: "An authenticated userId is required.",
          code: "REQUIRED",
        },
      ]);
    return { ...request, userId: authContext.authenticatedUserId };
  }
  if (request.userId !== undefined) return { ...request, userId: request.userId };
  if (request.anonymousSessionId !== undefined && isUuidV4(request.anonymousSessionId))
    return { ...request, userId: request.anonymousSessionId };
  throw new RequestValidationException([
    {
      path: "userId",
      message: "An authenticated userId or anonymousSessionId is required.",
      code: "REQUIRED",
    },
  ]);
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
    const body = validateCheckInRequest(await this.#body(request));
    if (!body.success) return validationResponse(body.errors);
    if (body.data.rallyId !== this.#config.id)
      return validationResponse([
        {
          path: "rallyId",
          message: "The rally does not match this server.",
          code: "INVALID_VALUE",
        },
      ]);
    const userId = await this.#user(request);
    if (userId === null)
      return json(
        { ok: false, code: "UNAUTHENTICATED", message: "Authentication is required." },
        401,
      );
    const sessionId = request.headers.get("x-anonymous-session-id");
    let result: CheckInResponse;
    try {
      result = await this.checkIn({
        ...body.data,
        userId,
        ...(sessionId === null ? {} : { anonymousSessionId: sessionId }),
      });
    } catch (error) {
      if (error instanceof RequestValidationException) return validationResponse(error.errors);
      throw error;
    }
    return json(
      { ...result, status: operationStatus(result) },
      result.ok ? 200 : result.code === "SPOT_NOT_FOUND" ? 404 : 422,
    );
  }
  async handleClaimReward(request: Request): Promise<Response> {
    const body = validateClaimRewardRequest(await this.#body(request));
    if (!body.success) return validationResponse(body.errors);
    if (body.data.rallyId !== this.#config.id)
      return validationResponse([
        {
          path: "rallyId",
          message: "The rally does not match this server.",
          code: "INVALID_VALUE",
        },
      ]);
    const userId = await this.#user(request);
    if (userId === null)
      return json(
        { ok: false, code: "UNAUTHENTICATED", message: "Authentication is required." },
        401,
      );
    const sessionId = request.headers.get("x-anonymous-session-id");
    let result: ClaimResponse;
    try {
      result = await this.claimReward({
        ...body.data,
        userId,
        ...(sessionId === null ? {} : { anonymousSessionId: sessionId }),
      });
    } catch (error) {
      if (error instanceof RequestValidationException) return validationResponse(error.errors);
      throw error;
    }
    return json(
      { ...result, status: operationStatus(result) },
      result.ok ? 200 : result.code === "REWARD_NOT_FOUND" ? 404 : 422,
    );
  }
  async handleSync(request: Request): Promise<Response> {
    const body = validateSyncRequest(await this.#body(request));
    if (!body.success) return validationResponse(body.errors);
    if (body.data.rallyId !== this.#config.id)
      return validationResponse([
        {
          path: "rallyId",
          message: "The rally does not match this server.",
          code: "INVALID_VALUE",
        },
      ]);
    const userId = await this.#user(request);
    if (userId === null)
      return json(
        { ok: false, code: "UNAUTHENTICATED", message: "Authentication is required." },
        401,
      );
    const sessionId = request.headers.get("x-anonymous-session-id");
    const authContext: TrustedAuthContext = {
      authenticatedUserId: userId,
      ...(sessionId === null ? {} : { isAnonymous: true, sessionId }),
    };
    try {
      return json({
        ok: true,
        state: await this.syncProgress(
          {
            rallyId: body.data.rallyId,
            ...(sessionId === null ? {} : { anonymousSessionId: sessionId }),
          },
          authContext,
        ),
      });
    } catch (error) {
      if (error instanceof RequestValidationException) return validationResponse(error.errors);
      throw error;
    }
  }
  async checkIn(
    request: CheckInRequest,
    authContext?: TrustedAuthContext,
  ): Promise<CheckInResponse> {
    const directRequest = withDirectIdentity(request, authContext);
    assertValidCheckInParams(directRequest, this.#config);
    const { userId } = directRequest;
    const key = `check-in:${request.rallyId}:${userId}:${request.idempotencyKey}`;
    const previous = await this.#persistence.getIdempotentResult<CheckInResponse>(
      request.rallyId,
      key,
    );
    if (previous !== null) return previous;
    const lockKey = `state:${request.rallyId}:${userId}`;
    if (
      !(await this.#persistence.acquireLock(
        request.rallyId,
        lockKey,
        this.#options.lockTtlMs ?? 5_000,
      ))
    )
      return { ok: false, code: "CONFLICT", message: "The user state is being updated." };
    const timestamp = now(this.#options);
    try {
      const current =
        (await this.#persistence.getUserState(request.rallyId, userId)) ??
        initialState(this.#config, userId, timestamp);
      const responseHolder: { value: CheckInResponse | null } = { value: null };
      const makeAudit = (status: "SUCCESS" | "REJECTED", code?: string): AuditLog =>
        audit(
          request.rallyId,
          userId,
          "CHECK_IN",
          request.spotId,
          request.idempotencyKey,
          status,
          timestamp,
          code,
        );
      const spot = this.#config.spots.find((item) => item.id === request.spotId);
      if (spot === undefined) {
        responseHolder.value = {
          ok: false,
          code: "SPOT_NOT_FOUND",
          message: "Spot was not found.",
        };
        return await this.#rememberCheckInTransaction(
          directRequest,
          timestamp,
          key,
          current,
          {
            nextUserState: current,
            auditLog: makeAudit("REJECTED", "SPOT_NOT_FOUND"),
            result: responseHolder.value,
            error: "SPOT_NOT_FOUND",
          },
          responseHolder,
        );
      }
      const rejected = (code: string, message: string) => {
        responseHolder.value = { ok: false, code, message };
        return {
          nextUserState: current,
          auditLog: makeAudit("REJECTED", code),
          result: responseHolder.value,
          error: code,
        };
      };
      if (current.records.some((record) => record.stampId === request.spotId))
        return await this.#rememberCheckInTransaction(
          directRequest,
          timestamp,
          key,
          current,
          rejected("STAMP_ALREADY_ACQUIRED", "Spot was already claimed."),
          responseHolder,
        );
      const acquired = new Set(current.records.map((record) => record.stampId));
      if (spot.prerequisites?.some((id) => !acquired.has(id)))
        return await this.#rememberCheckInTransaction(
          directRequest,
          timestamp,
          key,
          current,
          rejected("PREREQUISITES_NOT_MET", "Prerequisite spots are not complete."),
          responseHolder,
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
          return await this.#rememberCheckInTransaction(
            directRequest,
            timestamp,
            key,
            current,
            rejected("INVALID_PROOF", "Verification failed."),
            responseHolder,
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
      responseHolder.value = { ok: true, state: next };
      const transaction = await this.#persistence.executeCheckInTransaction(
        {
          rallyId: request.rallyId,
          userId,
          spotId: request.spotId,
          timestamp: timestampMillis(timestamp),
          idempotencyKey: key,
          proofData: request.context,
          ...(this.#options.idempotencyTtlMs === undefined
            ? {}
            : { idempotencyTtlMs: this.#options.idempotencyTtlMs }),
          initialUserState: current,
        },
        () => ({
          nextUserState: next,
          auditLog: makeAudit("SUCCESS"),
          result: responseHolder.value,
        }),
      );
      if (transaction.success && responseHolder.value !== null) return responseHolder.value;
      return {
        ok: false,
        code: "PERSISTENCE_FAILED",
        message: transaction.error ?? "Check-in failed.",
      };
    } finally {
      await this.#persistence.releaseLock(request.rallyId, lockKey);
    }
  }
  async claimReward(
    request: ClaimRewardRequest,
    authContext?: TrustedAuthContext,
  ): Promise<ClaimResponse> {
    const directRequest = withDirectIdentity(request, authContext);
    assertValidClaimParams(directRequest, this.#config);
    const { userId } = directRequest;
    const key = `claim:${request.rallyId}:${userId}:${request.rewardId}:${request.idempotencyKey}`;
    const previous = await this.#persistence.getIdempotentResult<ClaimResponse>(
      request.rallyId,
      key,
    );
    if (previous !== null) return previous;
    const reward = this.#config.rewards.find((item) => item.id === request.rewardId);
    if (reward === undefined)
      return this.#rememberClaim(
        key,
        { ok: false, code: "REWARD_NOT_FOUND", message: "Reward was not found." },
        directRequest,
        now(this.#options),
      );
    const plan = inventoryPlan(this.#config, reward.id, reward.stockLimit);
    if (plan.secondaryKey !== undefined && this.#persistence.supportsSecondaryStock !== true)
      throw new Error("SECONDARY_STOCK_UNSUPPORTED");
    const inventoryEnabled =
      plan.primaryInitial !== null ||
      (plan.secondaryInitial !== undefined && plan.secondaryInitial !== null);
    if (
      inventoryEnabled &&
      (this.#persistence.supportsRewardStock === false ||
        typeof this.#persistence.getRewardStock !== "function" ||
        typeof this.#persistence.executeClaimRewardTransaction !== "function")
    )
      return this.#rememberClaim(
        key,
        {
          ok: false,
          code: "INVENTORY_STORAGE_NOT_IMPLEMENTED",
          message: "This persistence adapter cannot atomically store inventory.",
        },
        directRequest,
        now(this.#options),
      );
    const lockKey =
      this.#config.inventoryMode === "shared"
        ? "inventory:shared"
        : `reward:${request.rallyId}:${reward.id}`;
    if (
      !(await this.#persistence.acquireLock(
        request.rallyId,
        lockKey,
        this.#options.lockTtlMs ?? 5_000,
      ))
    )
      return { ok: false, code: "CONFLICT", message: "The reward is being claimed." };
    const timestamp = now(this.#options);
    try {
      const checked = await this.#persistence.getIdempotentResult<ClaimResponse>(
        request.rallyId,
        key,
      );
      if (checked !== null) return checked;
      const responseHolder: { value: ClaimResponse | null } = { value: null };
      const result = await this.#persistence.executeClaimRewardTransaction(
        {
          rallyId: request.rallyId,
          userId,
          rewardId: reward.id,
          stockKey: plan.primaryKey,
          ...(plan.secondaryKey === undefined ? {} : { secondaryStockKey: plan.secondaryKey }),
          rewardStockLimit: rewardStock(this.#config, reward),
          sharedStockLimit:
            this.#config.inventoryMode === "shared" ? sharedStock(this.#config) : null,
          initialStock: plan.primaryInitial,
          ...(plan.secondaryInitial === undefined
            ? {}
            : { initialSecondaryStock: plan.secondaryInitial }),
          ticketNumber: request.idempotencyKey,
          timestamp: Number.isNaN(Date.parse(timestamp)) ? Date.now() : Date.parse(timestamp),
          idempotencyKey: key,
          ...(request.staffPasscode === undefined ? {} : { proofData: request.staffPasscode }),
          ...(this.#options.idempotencyTtlMs === undefined
            ? {}
            : { idempotencyTtlMs: this.#options.idempotencyTtlMs }),
          initialUserState: initialState(this.#config, userId, timestamp),
        },
        ({ stock, secondaryStock, claimCount, userState }) => {
          const storedReward = userState.rewards.find((item) => item.rewardId === reward.id) ?? {
            rewardId: reward.id,
            status: "LOCKED" as const,
          };
          const currentReward =
            reward.redemptionMethod === "server_claim" &&
            storedReward.status === "CONSUMED" &&
            (reward.userClaimLimit === undefined || claimCount < reward.userClaimLimit)
              ? { ...storedReward, status: "AVAILABLE" as const }
              : storedReward;
          const makeAudit = (status: "SUCCESS" | "REJECTED", code?: string): AuditLog =>
            audit(
              request.rallyId,
              userId,
              "CLAIM_REWARD",
              reward.id,
              request.idempotencyKey,
              status,
              timestamp,
              code,
            );
          if ((stock !== null && stock <= 0) || (secondaryStock !== null && secondaryStock <= 0)) {
            responseHolder.value = {
              ok: false,
              code: "OUT_OF_STOCK",
              message: "Reward is out of stock.",
            };
            return {
              nextStock: stock,
              ...(plan.secondaryKey === undefined ? {} : { nextSecondaryStock: secondaryStock }),
              nextUserState: userState,
              auditLog: makeAudit("REJECTED", "OUT_OF_STOCK"),
              result: responseHolder.value,
              error: "OUT_OF_STOCK",
            };
          }
          const effectiveReward =
            reward.staffPasscode === undefined && this.#config.staffPasscode !== undefined
              ? { ...reward, staffPasscode: this.#config.staffPasscode }
              : reward;
          const local = consumeReward({
            reward: effectiveReward,
            currentState: currentReward,
            now: timestamp,
            userRedemptionCount: claimCount,
            ...(request.staffPasscode === undefined
              ? {}
              : { inputPasscode: request.staffPasscode }),
            ...(request.staffId === undefined ? {} : { staffId: request.staffId }),
          });
          if (!local.ok) {
            responseHolder.value = {
              ok: false,
              code: local.error.code,
              message: "Reward cannot be claimed.",
            };
            return {
              nextStock: stock,
              nextUserState: userState,
              auditLog: makeAudit("REJECTED", local.error.code),
              result: responseHolder.value,
              error: local.error.code,
            };
          }
          const nextRewards = userState.rewards.some((item) => item.rewardId === reward.id)
            ? userState.rewards.map((item) => (item.rewardId === reward.id ? local.value : item))
            : [...userState.rewards, local.value];
          const consumed = local.value.claimTicketNumber !== undefined;
          const nextStock = consumed && stock !== null ? Math.max(0, stock - 1) : stock;
          const nextSecondaryStock =
            consumed && secondaryStock !== null ? Math.max(0, secondaryStock - 1) : secondaryStock;
          const next: UserRallyState = {
            ...userState,
            rewards: nextRewards,
            updatedAt: timestamp,
            inventory: {
              ...(plan.primaryKey === "__shared__" && nextStock !== null
                ? { sharedRemaining: nextStock }
                : {}),
              ...(plan.secondaryKey !== undefined && nextSecondaryStock !== null
                ? { rewardRemaining: { [reward.id]: nextSecondaryStock } }
                : plan.primaryKey === reward.id && nextStock !== null
                  ? { rewardRemaining: { [reward.id]: nextStock } }
                  : {}),
            },
          };
          const inventory: InventoryStatus = {
            ...(plan.primaryKey === "__shared__" && nextStock !== null
              ? { sharedRemaining: nextStock }
              : {}),
            ...(plan.secondaryKey !== undefined && nextSecondaryStock !== null
              ? { rewardRemaining: nextSecondaryStock }
              : plan.primaryKey === reward.id && nextStock !== null
                ? { rewardRemaining: nextStock }
                : {}),
          };
          responseHolder.value =
            local.value.claimTicketNumber === undefined
              ? {
                  ok: true,
                  state: next,
                  ...(Object.keys(inventory).length === 0 ? {} : { inventory }),
                }
              : {
                  ok: true,
                  state: next,
                  claimTicketNumber: local.value.claimTicketNumber,
                  ...(Object.keys(inventory).length === 0 ? {} : { inventory }),
                };
          return {
            nextStock,
            ...(plan.secondaryKey === undefined ? {} : { nextSecondaryStock }),
            nextUserState: next,
            auditLog: makeAudit("SUCCESS"),
            result: responseHolder.value,
          };
        },
      );
      const response = responseHolder.value;
      if (!result.success) {
        if (response !== null && !response.ok && response.code === result.error) return response;
        if (result.error === "INVENTORY_STORAGE_NOT_IMPLEMENTED")
          return {
            ok: false,
            code: "INVENTORY_STORAGE_NOT_IMPLEMENTED",
            message: "This persistence adapter cannot atomically store inventory.",
          };
        return {
          ok: false,
          code: "PERSISTENCE_FAILED",
          message: result.error ?? "Reward claim failed.",
        };
      }
      if (response !== null && result.success) return response;
      return {
        ok: false,
        code: "PERSISTENCE_FAILED",
        message: result.error ?? "Reward claim failed.",
      };
    } catch (error) {
      return {
        ok: false,
        code: "PERSISTENCE_FAILED",
        message: error instanceof Error ? error.message : "Reward claim failed.",
      };
    } finally {
      await this.#persistence.releaseLock(request.rallyId, lockKey);
    }
  }
  async sync(rallyId: string, identity: string | TrustedAuthContext): Promise<UserRallyState> {
    const userId = typeof identity === "string" ? identity : identity.authenticatedUserId;
    assertValidSyncParams({ rallyId, userId }, this.#config);
    const state =
      (await this.#persistence.getUserState(rallyId, userId)) ??
      initialState(this.#config, userId, now(this.#options));
    return this.#attachInventory(state);
  }
  async syncProgress(
    request: {
      readonly rallyId: string;
      readonly userId?: string;
      readonly anonymousSessionId?: string;
    },
    authContext: TrustedAuthContext,
  ): Promise<UserRallyState> {
    const directRequest = withDirectIdentity(request, authContext);
    assertValidSyncParams(directRequest, this.#config);
    return this.sync(directRequest.rallyId, authContext);
  }
  async #attachInventory(state: UserRallyState): Promise<UserRallyState> {
    const rewardRemaining: Record<string, number> = {};
    for (const reward of this.#config.rewards) {
      const plan = inventoryPlan(this.#config, reward.id, reward.stockLimit);
      if (plan.secondaryKey !== undefined) {
        if (this.#persistence.supportsSecondaryStock !== true)
          throw new Error("SECONDARY_STOCK_UNSUPPORTED");
        const stock = await this.#persistence.getRewardStock(state.rallyId, plan.secondaryKey);
        const remaining = stock ?? plan.secondaryInitial ?? null;
        if (remaining !== null) rewardRemaining[reward.id] = Math.max(0, remaining);
      } else if (plan.primaryKey !== "__shared__") {
        const stock = await this.#persistence.getRewardStock(state.rallyId, plan.primaryKey);
        const remaining = stock ?? plan.primaryInitial;
        if (remaining !== null) rewardRemaining[reward.id] = Math.max(0, remaining);
      }
    }
    const shared = sharedStock(this.#config);
    const storedShared = await this.#persistence.getRewardStock(state.rallyId, "__shared__");
    const sharedRemaining =
      this.#config.inventoryMode === "shared" && shared !== null
        ? Math.max(0, storedShared ?? shared)
        : undefined;
    return {
      ...state,
      ...(Object.keys(rewardRemaining).length === 0 && sharedRemaining === undefined
        ? {}
        : {
            inventory: {
              ...(sharedRemaining === undefined ? {} : { sharedRemaining }),
              ...(Object.keys(rewardRemaining).length === 0 ? {} : { rewardRemaining }),
            },
          }),
    };
  }
  async #body(request: Request): Promise<unknown> {
    try {
      const value: unknown = await request.json();
      return isObject(value) ? value : null;
    } catch {
      return null;
    }
  }
  async #user(request: Request): Promise<string | null> {
    if (this.#options.authenticate !== undefined) {
      const identity = await this.#options.authenticate(request);
      if (typeof identity === "string") return identity.length > 0 ? identity : null;
      if (identity === null) return null;
      const authenticatedUserId = identity.authenticatedUserId;
      return authenticatedUserId.length > 0 ? authenticatedUserId : null;
    }
    const policy = this.#options.anonymousPolicy ?? "session_scoped";
    if (policy === "reject") return null;
    const sessionId = request.headers.get("X-Anonymous-Session-Id");
    if (sessionId !== null) return isUuidV4(sessionId) ? sessionId : null;
    if (policy === "session_scoped") return null;
    return "anonymous";
  }

  async #rememberCheckInTransaction(
    request: CheckInRequest & { readonly userId: string },
    timestamp: string,
    key: string,
    current: UserRallyState,
    mutation: {
      readonly nextUserState: UserRallyState;
      readonly auditLog: AuditLog;
      readonly result?: unknown;
      readonly error?: string;
    },
    responseHolder: { value: CheckInResponse | null },
  ): Promise<CheckInResponse> {
    const transaction = await this.#persistence.executeCheckInTransaction(
      {
        rallyId: request.rallyId,
        userId: request.userId,
        spotId: request.spotId,
        timestamp: timestampMillis(timestamp),
        idempotencyKey: key,
        ...(this.#options.idempotencyTtlMs === undefined
          ? {}
          : { idempotencyTtlMs: this.#options.idempotencyTtlMs }),
        initialUserState: current,
      },
      () => mutation,
    );
    if (
      responseHolder.value !== null &&
      (transaction.success || transaction.error === mutation.error)
    )
      return responseHolder.value;
    return {
      ok: false,
      code: "PERSISTENCE_FAILED",
      message: transaction.error ?? "Check-in failed.",
    };
  }
  async #rememberClaim(
    key: string,
    result: ClaimResponse,
    request: ClaimRewardRequest & { readonly userId: string },
    timestamp: string,
  ): Promise<ClaimResponse> {
    await this.#persistence.recordAuditLog(
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
    await this.#persistence.saveIdempotentResult(
      request.rallyId,
      key,
      result,
      this.#options.idempotencyTtlMs ?? 86_400_000,
    );
    return result;
  }
}
