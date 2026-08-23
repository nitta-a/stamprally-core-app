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
  useOptimistic,
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
  ) => Promise<Result<ProcessStampValue, StampError>>;
  readonly reset: (now?: string) => Promise<StampRallyState>;
  readonly redeem: (rewardId: string, options?: RedeemOptions) => Promise<ConsumeResult>;
  readonly exportRecoveryCode: () => string;
  readonly importRecoveryCode: (token: string) => Promise<boolean>;
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

export function useStampRally(client: StampRallyClient): UseStampRallyReturn {
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
  const [isPending, startTransition] = useTransition();
  const [optimisticState, addOptimisticAcquire] = useOptimistic(rawState, applyOptimisticAcquire);

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
    ): Promise<Result<ProcessStampValue, StampError>> => {
      const acquiredAt = now ?? new Date().toISOString();
      setClientError(null);

      return new Promise((resolve, reject) => {
        startTransition(async () => {
          addOptimisticAcquire({ stampId, acquiredAt });
          try {
            const result = await client.acquire(stampId, context, acquiredAt);
            if (!result.ok) {
              setClientError({ client, value: result.error });
            }
            resolve(result);
          } catch (acquireError) {
            const normalizedError = toError(acquireError);
            setClientError({ client, value: normalizedError });
            reject(normalizedError);
          }
        });
      });
    },
    [addOptimisticAcquire, client],
  );

  const reset = useCallback(
    (now?: string): Promise<StampRallyState> => {
      setClientError(null);

      return new Promise((resolve, reject) => {
        startTransition(async () => {
          try {
            const nextState = now === undefined ? await client.reset() : await client.reset(now);
            resolve(nextState);
          } catch (resetError) {
            const normalizedError = toError(resetError);
            setClientError({ client, value: normalizedError });
            reject(normalizedError);
          }
        });
      });
    },
    [client],
  );

  const redeem = useCallback(
    (rewardId: string, options: RedeemOptions = {}): Promise<ConsumeResult> => {
      setClientError(null);

      return new Promise((resolve, reject) => {
        startTransition(async () => {
          const reward = client.getConfig().rewards?.find((item) => item.id === rewardId);
          if (reward === undefined) {
            const result: ConsumeResult = {
              ok: false,
              error: { code: "REWARD_NOT_FOUND", rewardId },
            };
            setClientError({ client, value: result.error });
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
            resolve(result);
            return;
          }

          const result = consumeReward({
            reward,
            currentState: currentRewardState,
            now: new Date().toISOString(),
            ...(options.passcode === undefined ? {} : { inputPasscode: options.passcode }),
            ...(options.staffId === undefined ? {} : { staffId: options.staffId }),
          });
          if (!result.ok) {
            setClientError({ client, value: result.error });
            resolve(result);
            return;
          }

          if (result.value === currentRewardState) {
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
            resolve(result);
          } catch (redeemError) {
            const normalizedError = toError(redeemError);
            setClientError({ client, value: normalizedError });
            reject(normalizedError);
          }
        });
      });
    },
    [client],
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

      return new Promise((resolve, reject) => {
        startTransition(async () => {
          const config = client.getConfig();
          const snapshot = importProgressToken(token, config.id);
          if (snapshot === null) {
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
            resolve(true);
          } catch (importError) {
            const normalizedError = toError(importError);
            setClientError({ client, value: normalizedError });
            reject(normalizedError);
          }
        });
      });
    },
    [client],
  );

  const isLoading =
    rawState === null && (clientStatus.client !== client || clientStatus.isInitializing);
  const error = clientError?.client === client ? clientError.value : null;

  return {
    state: optimisticState,
    isLoading,
    isPending,
    error,
    rewardsState: optimisticState?.rewards ?? [],
    acquire,
    reset,
    redeem,
    exportRecoveryCode,
    importRecoveryCode,
  };
}
