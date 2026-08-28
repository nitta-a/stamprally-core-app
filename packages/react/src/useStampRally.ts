import type {
  CheckInOptions,
  CheckInResult,
  ClaimOptions,
  ClaimResult,
  StampRallyClient,
  SyncState,
  UserRallyState,
} from "@stamprally/core";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export interface UseStampRallyOptions {
  readonly initialize?: boolean;
}
export interface UseStampRallyReturn {
  readonly state: UserRallyState | null;
  readonly config: ReturnType<StampRallyClient["getConfig"]>;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly onCheckIn: (
    spotId: string,
    proof: unknown,
    options?: CheckInOptions,
  ) => Promise<CheckInResult>;
  readonly onClaimReward: (rewardId: string, options?: ClaimOptions) => Promise<ClaimResult>;
  readonly onSync: () => Promise<void>;
  readonly retrySync: () => Promise<void>;
  readonly syncState: SyncState;
  readonly pendingCount: number;
  readonly switchUser: (userId: string | null) => Promise<UserRallyState>;
  readonly clearUserState: (userId?: string) => Promise<void>;
}
function serverSnapshot(): null {
  return null;
}
function errorFrom(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
export function useStampRally(
  client: StampRallyClient,
  options: UseStampRallyOptions = {},
): UseStampRallyReturn {
  const subscribe = useCallback((listener: () => void) => client.subscribe(listener), [client]);
  const getSnapshot = useCallback(() => client.getState(), [client]);
  const state = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    if (options.initialize === false || client.getState() !== null) return;
    let active = true;
    void client.init().catch((reason: unknown) => {
      if (active) setError(errorFrom(reason));
    });
    return () => {
      active = false;
    };
  }, [client, options.initialize]);
  const onCheckIn = useCallback(
    (spotId: string, proof: unknown, checkInOptions: CheckInOptions = {}) => {
      setError(null);
      return client.checkIn(spotId, proof, checkInOptions).then((result) => {
        if (!result.ok) setError(errorFrom(result.error));
        return result;
      });
    },
    [client],
  );
  const onClaimReward = useCallback(
    (rewardId: string, claimOptions: ClaimOptions = {}) => {
      setError(null);
      return client.claimReward(rewardId, claimOptions).then((result) => {
        if (!result.ok) setError(errorFrom(result.error));
        return result;
      });
    },
    [client],
  );
  const onSync = useCallback(() => {
    setError(null);
    return client.sync().catch((reason: unknown) => {
      const next = errorFrom(reason);
      setError(next);
      throw next;
    });
  }, [client]);
  return {
    state,
    config: client.getConfig(),
    isLoading: state === null,
    error,
    onCheckIn,
    onClaimReward,
    onSync,
    retrySync: onSync,
    syncState: client.syncState,
    pendingCount: client.pendingCount,
    switchUser: client.switchUser.bind(client),
    clearUserState: client.clearUserState.bind(client),
  };
}
