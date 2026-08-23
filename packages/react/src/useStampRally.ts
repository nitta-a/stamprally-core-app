import {
  calculateProgress,
  type ProcessStampValue,
  type RallyConfig,
  type Result,
  type StampError,
  StampRallyClient,
  type StampRallyProgress,
  type StampRallyState,
  type StampStorage,
  type VerificationContext,
} from "@stamprally/core";
import { useCallback, useEffect, useMemo, useState } from "react";

export interface UseStampRallyValue {
  readonly state: StampRallyState | null;
  readonly progress: StampRallyProgress;
  readonly isLoading: boolean;
  readonly error: StampError | Error | null;
  readonly acquire: (
    stampId: string,
    context: VerificationContext,
    now?: string,
  ) => Promise<Result<ProcessStampValue, StampError>>;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function useStampRally(config: RallyConfig, storage: StampStorage): UseStampRallyValue {
  const client = useMemo(() => new StampRallyClient(config, storage), [config, storage]);
  const [state, setState] = useState<StampRallyState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<StampError | Error | null>(null);

  useEffect(() => {
    let active = true;
    setState(null);
    setError(null);
    setIsLoading(true);

    const unsubscribe = client.subscribe((nextState) => {
      if (active) setState(nextState);
    });

    void client
      .initialize()
      .then((nextState) => {
        if (active) setState(nextState);
      })
      .catch((loadError: unknown) => {
        if (active) setError(toError(loadError));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [client]);

  const acquire = useCallback(
    async (
      stampId: string,
      context: VerificationContext,
      now?: string,
    ): Promise<Result<ProcessStampValue, StampError>> => {
      setError(null);
      try {
        const result =
          now === undefined
            ? await client.acquire(stampId, context)
            : await client.acquire(stampId, context, now);
        if (!result.ok) setError(result.error);
        return result;
      } catch (acquireError) {
        const normalizedError = toError(acquireError);
        setError(normalizedError);
        throw normalizedError;
      }
    },
    [client],
  );

  const progressState: StampRallyState = state ?? {
    rallyId: config.id,
    records: [],
    updatedAt: "",
  };

  return {
    state,
    progress: calculateProgress(progressState, config),
    isLoading,
    error,
    acquire,
  };
}
