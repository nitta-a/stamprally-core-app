import type {
  ProcessStampValue,
  Result,
  StampError,
  StampRallyClient,
  StampRallyState,
  VerificationContext,
} from "@stamprally/core";
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
  readonly value: StampError | Error;
}

export interface UseStampRallyReturn {
  readonly state: StampRallyState | null;
  readonly isLoading: boolean;
  readonly isPending: boolean;
  readonly error: StampError | Error | null;
  readonly acquire: (
    stampId: string,
    context: VerificationContext,
    now?: string,
  ) => Promise<Result<ProcessStampValue, StampError>>;
  readonly reset: (now?: string) => Promise<StampRallyState>;
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
    setClientStatus({ client, isInitializing: client.getState() === null });

    void client
      .initialize()
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
  }, [client]);

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

  const isLoading =
    rawState === null && (clientStatus.client !== client || clientStatus.isInitializing);
  const error = clientError?.client === client ? clientError.value : null;

  return {
    state: optimisticState,
    isLoading,
    isPending,
    error,
    acquire,
    reset,
  };
}
