import type {
  ConsumeResult,
  ProcessStampValue,
  Result,
  RewardConsumeError,
  RewardState,
  StampError,
  StampRallyClient,
  StampRallyState,
  VerificationContext,
} from "@stamprally/core";
import { consumeReward, exportProgressToken, importProgressToken } from "@stamprally/core";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";

interface OptimisticAcquire {
  readonly stampId: string;
  readonly acquiredAt: string;
}

interface ClientStatus {
  readonly client: StampRallyClient;
  readonly isInitializing: boolean;
}

interface ClientError {
  readonly client: StampRallyClient;
  readonly value: StampError | RewardConsumeError | Error;
}

export interface CheckInRequest {
  readonly stampId: string;
  readonly context: VerificationContext;
  readonly now: string;
  readonly idempotencyKey: string;
}

export interface SyncAdapter {
  readonly isOnline?: boolean | (() => boolean);
  readonly onBeforeCheckIn?: (request: CheckInRequest) => unknown;
  readonly onServerVerify?: (request: CheckInRequest) => unknown;
  readonly onStateChange?: (state: StampRallyState) => void;
}

export interface StampRallyEventHandlers {
  readonly onStampClaimed?: (record: StampRallyState["records"][number]) => void;
  readonly onRewardUnlocked?: (rewardId: string) => void;
  readonly onRewardConsumed?: (rewardId: string) => void;
}

export interface UseStampRallyOptions {
  readonly syncAdapter?: SyncAdapter;
  readonly events?: StampRallyEventHandlers;
  readonly onStampClaimed?: StampRallyEventHandlers["onStampClaimed"];
  readonly onRewardUnlocked?: StampRallyEventHandlers["onRewardUnlocked"];
  readonly onRewardConsumed?: StampRallyEventHandlers["onRewardConsumed"];
}

export interface RedeemOptions {
  readonly passcode?: string;
  readonly staffId?: string;
}

export interface UseStampRallyReturn {
  readonly state: StampRallyState | null;
  readonly isLoading: boolean;
  readonly isPending: boolean;
  readonly error: StampError | RewardConsumeError | Error | null;
  readonly rewardsState: ReadonlyArray<RewardState>;
  readonly acquire: (
    stampId: string,
    context: VerificationContext,
    now?: string,
    idempotencyKey?: string,
  ) => Promise<Result<ProcessStampValue, StampError>>;
  readonly reset: (now?: string) => Promise<StampRallyState>;
  readonly redeem: (rewardId: string, options?: RedeemOptions) => Promise<ConsumeResult>;
  readonly exportRecoveryCode: () => string;
  readonly importRecoveryCode: (token: string) => Promise<boolean>;
  readonly queuedCount: number;
  readonly flushQueue: () => Promise<void>;
}

/** @deprecated Use UseStampRallyReturn instead. */
export type UseStampRallyValue = UseStampRallyReturn;

function getServerSnapshot(): null {
  return null;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function applyOptimisticAcquire(
  currentState: StampRallyState | null,
  action: OptimisticAcquire,
): StampRallyState | null {
  if (
    currentState === null ||
    currentState.records.some((record) => record.stampId === action.stampId)
  ) {
    return currentState;
  }

  return {
    ...currentState,
    records: [...currentState.records, { stampId: action.stampId, acquiredAt: action.acquiredAt }],
    updatedAt: action.acquiredAt,
  };
}

function createIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi !== undefined && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  return `stamp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isOnline(adapter: SyncAdapter | undefined): boolean {
  if (adapter?.isOnline === undefined) {
    return typeof navigator === "undefined" || navigator.onLine !== false;
  }
  return typeof adapter.isOnline === "function" ? adapter.isOnline() : adapter.isOnline;
}

function isRejectedVerification(value: unknown): boolean {
  return (
    value === false ||
    (typeof value === "object" && value !== null && "ok" in value && value.ok === false)
  );
}

export function useStampRally(
  client: StampRallyClient,
  options: UseStampRallyOptions = {},
): UseStampRallyReturn {
  const syncAdapter = options.syncAdapter;
  const events = options.events;
  const queuedRequests = useRef<ReadonlyArray<CheckInRequest>>([]);
  const subscribe = useCallback(
    (onStoreChange: () => void) => client.subscribe(() => onStoreChange()),
    [client],
  );
  const getSnapshot = useCallback(() => client.getState(), [client]);
  const rawState = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [clientStatus, setClientStatus] = useState<ClientStatus>(() => ({
    client,
    isInitializing: client.getState() === null,
  }));
  const [clientError, setClientError] = useState<ClientError | null>(null);
  const [isPending] = useTransition();
  const [isOperationPending, setIsOperationPending] = useState(false);
  const [optimisticState, setOptimisticState] = useState<StampRallyState | null>(rawState);

  useEffect(() => {
    setOptimisticState(rawState);
  }, [rawState]);

  useEffect(() => {
    if (syncAdapter?.onStateChange === undefined) return;
    return client.subscribe(syncAdapter.onStateChange);
  }, [client, syncAdapter]);

  useEffect(() => {
    let active = true;
    setClientError(null);
    if (rawState !== null) {
      setClientStatus({ client, isInitializing: false });
      return () => {
        active = false;
      };
    }

    setClientStatus({ client, isInitializing: true });

    void client
      .init()
      .catch((initializationError: unknown) => {
        if (active) {
          setClientError({ client, value: toError(initializationError) });
        }
      })
      .finally(() => {
        if (active) {
          setClientStatus({ client, isInitializing: false });
        }
      });

    return () => {
      active = false;
    };
  }, [client, rawState]);

  const acquire = useCallback(
    (
      stampId: string,
      context: VerificationContext,
      now?: string,
      idempotencyKey?: string,
    ): Promise<Result<ProcessStampValue, StampError>> => {
      const acquiredAt = now ?? new Date().toISOString();
      const request: CheckInRequest = {
        stampId,
        context,
        now: acquiredAt,
        idempotencyKey: idempotencyKey ?? createIdempotencyKey(),
      };
      setClientError(null);

      if (!isOnline(syncAdapter)) {
        queuedRequests.current = [...queuedRequests.current, request];
        const queued: Result<ProcessStampValue, StampError> = {
          ok: false,
          error: { code: "OFFLINE_QUEUED", stampId, idempotencyKey: request.idempotencyKey },
        };
        setClientError({ client, value: queued.error });
        return Promise.resolve(queued);
      }

      setIsOperationPending(true);
      setOptimisticState((current) => applyOptimisticAcquire(current, { stampId, acquiredAt }));
      return new Promise((resolve, reject) => {
        void (async () => {
          try {
            const before = await syncAdapter?.onBeforeCheckIn?.(request);
            if (before === false) {
              const rejected: Result<ProcessStampValue, StampError> = {
                ok: false,
                error: { code: "INVALID_PROOF", stampId },
              };
              setClientError({ client, value: rejected.error });
              setIsOperationPending(false);
              resolve(rejected);
              return;
            }
            const result = await client.acquire(stampId, context, acquiredAt);
            if (result.ok) {
              const verified = await syncAdapter?.onServerVerify?.(request);
              if (isRejectedVerification(verified)) {
                await client.restore(rawState ?? client.getState() ?? result.value.nextState);
                const rejected: Result<ProcessStampValue, StampError> = {
                  ok: false,
                  error: { code: "INVALID_PROOF", stampId },
                };
                setClientError({ client, value: rejected.error });
                setOptimisticState(client.getState());
                setIsOperationPending(false);
                resolve(rejected);
                return;
              }
              for (const event of result.value.events) {
                if (event.type === "stampAcquired") {
                  (events?.onStampClaimed ?? options.onStampClaimed)?.(event.record);
                }
                if (event.type === "rewardUnlocked") {
                  (events?.onRewardUnlocked ?? options.onRewardUnlocked)?.(event.rewardId);
                }
              }
            }
            if (!result.ok) {
              setClientError({ client, value: result.error });
              setOptimisticState(client.getState());
            }
            setIsOperationPending(false);
            resolve(result);
          } catch (acquireError) {
            const normalizedError = toError(acquireError);
            setClientError({ client, value: normalizedError });
            setOptimisticState(client.getState());
            setIsOperationPending(false);
            reject(normalizedError);
          }
        })();
      });
    },
    [client, events, options.onRewardUnlocked, options.onStampClaimed, rawState, syncAdapter],
  );

  const reset = useCallback(
    (now?: string): Promise<StampRallyState> => {
      setClientError(null);
      setIsOperationPending(true);

      return new Promise((resolve, reject) => {
        void (async () => {
          try {
            const nextState = now === undefined ? await client.reset() : await client.reset(now);
            setIsOperationPending(false);
            resolve(nextState);
          } catch (resetError) {
            const normalizedError = toError(resetError);
            setClientError({ client, value: normalizedError });
            setIsOperationPending(false);
            reject(normalizedError);
          }
        })();
      });
    },
    [client],
  );

  const redeem = useCallback(
    (rewardId: string, redeemOptions: RedeemOptions = {}): Promise<ConsumeResult> => {
      setClientError(null);
      setIsOperationPending(true);

      return new Promise((resolve, reject) => {
        void (async () => {
          const reward = client.getConfig().rewards?.find((item) => item.id === rewardId);
          if (reward === undefined) {
            const result: ConsumeResult = {
              ok: false,
              error: { code: "REWARD_NOT_FOUND", rewardId },
            };
            setClientError({ client, value: result.error });
            setIsOperationPending(false);
            resolve(result);
            return;
          }

          const currentState = client.getState();
          const currentRewardState = currentState?.rewards?.find(
            (state) => state.rewardId === rewardId,
          );
          if (currentState === null || currentRewardState === undefined) {
            const result: ConsumeResult = {
              ok: false,
              error: { code: "NOT_AVAILABLE", rewardId },
            };
            setClientError({ client, value: result.error });
            setIsOperationPending(false);
            resolve(result);
            return;
          }

          const result = consumeReward({
            reward,
            currentState: currentRewardState,
            now: new Date().toISOString(),
            ...(redeemOptions.passcode === undefined
              ? {}
              : { inputPasscode: redeemOptions.passcode }),
            ...(redeemOptions.staffId === undefined ? {} : { staffId: redeemOptions.staffId }),
          });
          if (!result.ok) {
            setClientError({ client, value: result.error });
            setIsOperationPending(false);
            resolve(result);
            return;
          }

          if (result.value === currentRewardState) {
            setIsOperationPending(false);
            resolve(result);
            return;
          }

          const nextState: StampRallyState = {
            ...currentState,
            rewards: (currentState.rewards ?? []).map((state) =>
              state.rewardId === rewardId ? result.value : state,
            ),
            updatedAt: result.value.consumedAt ?? currentState.updatedAt,
          };

          try {
            await client.restore(nextState);
            (events?.onRewardConsumed ?? options.onRewardConsumed)?.(rewardId);
            setIsOperationPending(false);
            resolve(result);
          } catch (redeemError) {
            const normalizedError = toError(redeemError);
            setClientError({ client, value: normalizedError });
            setIsOperationPending(false);
            reject(normalizedError);
          }
        })();
      });
    },
    [client, events, options.onRewardConsumed],
  );

  const exportRecoveryCode = useCallback((): string => {
    const state = client.getState();
    if (state === null) {
      throw new Error("Cannot export recovery code before the rally is initialized.");
    }

    return exportProgressToken({
      version: 1,
      rallyId: state.rallyId,
      stamps: state.records,
      rewards: state.rewards ?? [],
      exportedAt: new Date().toISOString(),
    });
  }, [client]);

  const importRecoveryCode = useCallback(
    (token: string): Promise<boolean> => {
      setClientError(null);
      setIsOperationPending(true);

      return new Promise((resolve, reject) => {
        void (async () => {
          const config = client.getConfig();
          const snapshot = importProgressToken(token, config.id);
          if (snapshot === null) {
            setIsOperationPending(false);
            resolve(false);
            return;
          }

          const stampIds = new Set(config.stamps.map((stamp) => stamp.id));
          const rewardIds = new Set((config.rewards ?? []).map((reward) => reward.id));
          const importedStampIds = new Set<string>();
          const importedRewardIds = new Set<string>();
          const stamps = snapshot.stamps.filter((record) => {
            if (!stampIds.has(record.stampId) || importedStampIds.has(record.stampId)) return false;
            importedStampIds.add(record.stampId);
            return true;
          });
          const rewards = snapshot.rewards.filter((state) => {
            if (!rewardIds.has(state.rewardId) || importedRewardIds.has(state.rewardId))
              return false;
            importedRewardIds.add(state.rewardId);
            return true;
          });

          try {
            await client.restore({
              rallyId: config.id,
              records: stamps,
              ...(config.rewards === undefined && rewards.length === 0 ? {} : { rewards }),
              updatedAt: snapshot.exportedAt,
            });
            setIsOperationPending(false);
            resolve(true);
          } catch (importError) {
            const normalizedError = toError(importError);
            setClientError({ client, value: normalizedError });
            setIsOperationPending(false);
            reject(normalizedError);
          }
        })();
      });
    },
    [client],
  );

  const isLoading =
    rawState === null && (clientStatus.client !== client || clientStatus.isInitializing);
  const error = clientError?.client === client ? clientError.value : null;

  const flushQueue = useCallback(async (): Promise<void> => {
    if (!isOnline(syncAdapter)) return;
    const pending = queuedRequests.current;
    queuedRequests.current = [];
    for (const request of pending) {
      await acquire(request.stampId, request.context, request.now, request.idempotencyKey);
    }
  }, [acquire, syncAdapter]);

  return {
    state: optimisticState,
    isLoading,
    isPending: isPending || isOperationPending,
    error,
    rewardsState: optimisticState?.rewards ?? [],
    acquire,
    reset,
    redeem,
    exportRecoveryCode,
    importRecoveryCode,
    queuedCount: queuedRequests.current.length,
    flushQueue,
  };
}
