# @stamprally/react

React 19 integration for [`@stamprally/core`](https://www.npmjs.com/package/@stamprally/core).
The package provides the `useStampRally` hook with external-store updates,
optimistic stamp acquisition, persistence, reward redemption, and recovery-code
support.

## Install

```sh
npm install @stamprally/core @stamprally/react react
```

Or with pnpm:

```sh
pnpm add @stamprally/core @stamprally/react react
```

This package supports React `>=19.0.0 <20.0.0`.

## Quick start

```tsx
import { useMemo } from "react";
import {
  LocalStorageAdapter,
  StampRallyClient,
  type RallyConfig,
} from "@stamprally/core";
import { useStampRally } from "@stamprally/react";

const config: RallyConfig = {
  id: "city-tour",
  stamps: [
    {
      id: "station",
      name: "Central Station",
      condition: { type: "instant" },
    },
  ],
};

export function Rally() {
  const client = useMemo(
    () => new StampRallyClient(config, new LocalStorageAdapter()),
    [],
  );
  const { state, isLoading, isPending, error, acquire } = useStampRally(client);

  if (isLoading) return <p>Loading…</p>;

  return (
    <section>
      <p>
        {state?.records.length ?? 0} stamp(s) collected
      </p>
      <button
        disabled={isPending}
        onClick={() => void acquire("station", { type: "instant" })}
      >
        Collect stamp
      </button>
      {error !== null && <p role="alert">Could not collect the stamp.</p>}
    </section>
  );
}
```

The hook initializes the client when needed, subscribes to state changes, and
keeps the UI synchronized with persisted state. Keep the `StampRallyClient`
instance stable, for example with `useMemo`, so that the hook does not switch
clients on every render.

## Hook return value

`useStampRally(client)` returns:

- `state`: the current `StampRallyState`, or `null` while it is not initialized.
- `isLoading`: whether the client is initializing or changing clients.
- `isPending`: whether an acquisition, reset, redemption, or import is pending.
- `error`: the latest typed engine/reward error or storage error.
- `rewardsState`: the current reward states, or an empty array when rewards are not configured.
- `acquire(stampId, context, now?)`: validates and persists a stamp acquisition.
- `reset(now?)`: clears the persisted rally state.
- `redeem(rewardId, options?)`: redeems an available reward, optionally with a staff passcode and ID.
- `exportRecoveryCode()`: exports confirmed stamp and reward progress.
- `importRecoveryCode(token)`: restores a rally-scoped recovery code and returns whether it was valid.

Acquisitions are shown optimistically while persistence is pending. Engine
validation and storage failures roll the optimistic state back and are exposed
through the returned `error` value and the rejected promise where applicable.

## Browser and server rendering

The hook uses React's external-store API and provides a `null` server snapshot.
The core package's browser adapters and detectors access browser globals only
when called, so applications can choose a different `StampStorage` for server
rendering, tests, or non-browser environments.

## License

MIT
