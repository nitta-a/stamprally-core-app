import type { AdminRallyConfig, StampRallyState, VerificationCondition } from "@stamprally/core";
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
  return { rallyId: config.id, records: [], updatedAt: now };
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
      await this.#persistence.recordAuditLog(audit(request, "SUCCESS", now));
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

  async #remember(
    key: string,
    result: UniversalCheckInResult,
    request: UniversalCheckInRequest,
    now: string,
  ): Promise<UniversalCheckInResult> {
    await this.#persistence.recordAuditLog(
      audit(request, "REJECTED", now, result.ok ? undefined : result.code),
    );
    await this.#persistence.saveIdempotentResult(
      key,
      result,
      this.#options.idempotencyTtlMs ?? 86_400_000,
    );
    return result;
  }
}

export type { StampRallyState };
