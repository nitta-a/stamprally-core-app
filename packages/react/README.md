# @stamprally/react v0.16.0

React integration for `@stamprally/core`. `useStampRally` subscribes to immutable client state and exposes check-in, reward-claim, synchronization, and user-switching operations.

```tsx
import { useMemo } from "react";
import { StampRallyClient, type PublicRallyConfig } from "@stamprally/core";
import { useStampRally } from "@stamprally/react";

const config: PublicRallyConfig = {
  id: "city-tour",
  version: "0.16.0",
  title: "City Tour",
  spots: [{ id: "station", orderIndex: 0, name: "Station", conditions: [{ type: "passcode" }] }],
  rewards: [],
};

export function Rally() {
  const client = useMemo(() => new StampRallyClient(config), []);
  const { state, isLoading, onCheckIn } = useStampRally(client);
  if (isLoading) return <p>Loading…</p>;
  return <button onClick={() => void onCheckIn("station", "ARRIVED")}>{state?.records.length ?? 0} checked in</button>;
}
```

The hook return value includes `state`, `isLoading`, `error`, `onCheckIn`, `onClaimReward`, `onSync`, `switchUser`, and `clearUserState`.

Offline queue responses are reflected immediately in `state`. Permanent server
rejections are delivered through `error`, while retryable transport failures
remain pending for `retrySync`.

## License

MIT
