# @stamprally/react

React 18 / 19 integration for `@stamprally/core`. `useStampRally` initializes the client and subscribes to its state.

## Setup

```sh
pnpm add @stamprally/core @stamprally/react
```

Keep the client instance stable and pass it to the hook:

```tsx
import type { StampRallyClient } from "@stamprally/core";
import { useStampRally } from "@stamprally/react";

export function Rally({ client }: { client: StampRallyClient }) {
  const { state, isLoading, error, onCheckIn } = useStampRally(client);
  if (isLoading) return <p>Loading…</p>;
  if (error) return <p role="alert">{error.message}</p>;
  return (
    <button onClick={() => void onCheckIn("station", "ARRIVED")}>
      {state?.records.length ?? 0} checked in
    </button>
  );
}
```

Create the client with a public configuration and a `syncAdapter` for server verification. The example assumes a `station` spot accepting a passcode.

## Operations and sync

- `onCheckIn`, `onClaimReward`: participant actions.
- `onSync`, `syncProgress`, `retrySync`: synchronization and retry.
- `syncState`, `queueCapabilities`: pending operations, rejected history, and storage capabilities.
- `linkAccount`, `exportCloudSnapshot`, `importCloudSnapshot`: account backup through a host-provided `CloudSyncAdapter`.
- `switchUser`, `clearUserState`: user-scoped progress management.

See the [cloud sync guide](https://github.com/nitta-a/stamprally-core-app/blob/main/docs/GOOGLE_AUTH_SYNC.md) for authentication integration.

## License

MIT
