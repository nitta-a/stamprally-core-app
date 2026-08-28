import type {
  CheckInOptions,
  ClaimOptions,
  ClientClaimResult,
  PublicRallyConfig,
  UniversalCheckInResult,
  UniversalStampRallyClient,
  UserRallyState,
} from "@stamprally/core";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export interface UseUniversalStampRallyOptions {
  readonly initialize?: boolean;
}

export interface UseUniversalStampRallyReturn {
  readonly state: UserRallyState;
  readonly config: PublicRallyConfig;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly onCheckIn: (
    spotId: string,
    proof: unknown,
    options?: CheckInOptions,
  ) => Promise<UniversalCheckInResult>;
  readonly onClaimReward: (rewardId: string, options?: ClaimOptions) => Promise<ClientClaimResult>;
  readonly onSync: () => Promise<void>;
}

function serverSnapshot(): null {
  return null;
}

function errorMessage(error: { readonly code: string; readonly message?: string }): string {
  return error.message ?? error.code;
}

/** React 18/19 adapter for UniversalStampRallyClient. */
export function useUniversalStampRally(
  client: UniversalStampRallyClient,
  options: UseUniversalStampRallyOptions = {},
): UseUniversalStampRallyReturn {
  const subscribe = useCallback(
    (listener: () => void) => client.subscribe(() => listener()),
    [client],
  );
  const getSnapshot = useCallback(() => client.getState(), [client]);
  const rawState = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  const state: UserRallyState = rawState ?? {
    rallyId: client.getConfig().id,
    records: [],
    updatedAt: new Date(0).toISOString(),
  };
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (options.initialize === false || client.getState() !== null) return;
    let active = true;
    void client.init().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason : new Error(String(reason)));
    });
    return () => {
      active = false;
    };
  }, [client, options.initialize]);

  useEffect(
    () =>
      client.subscribeEvents((event) => {
        if (event.type === "error") setError(new Error(errorMessage(event.error)));
      }),
    [client],
  );

  const onCheckIn = useCallback(
    (spotId: string, proof: unknown, checkInOptions: CheckInOptions = {}) => {
      setError(null);
      return client.checkIn(spotId, proof, checkInOptions).then((result) => {
        if (!result.ok) setError(new Error(errorMessage(result.error)));
        return result;
      });
    },
    [client],
  );
  const onClaimReward = useCallback(
    (rewardId: string, claimOptions: ClaimOptions = {}) => {
      setError(null);
      return client.claimReward(rewardId, claimOptions).then((result) => {
        if (!result.ok) setError(new Error(errorMessage(result.error)));
        return result;
      });
    },
    [client],
  );
  const onSync = useCallback(() => {
    setError(null);
    return client.sync().catch((reason: unknown) => {
      const next = reason instanceof Error ? reason : new Error(String(reason));
      setError(next);
      throw next;
    });
  }, [client]);

  return {
    state,
    config: client.getConfig(),
    isLoading: rawState === null,
    error,
    onCheckIn,
    onClaimReward,
    onSync,
  };
}
