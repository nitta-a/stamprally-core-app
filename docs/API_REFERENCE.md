# API reference

## `syncProgress`

`StampRallyServer.syncProgress(request, auth)` processes the
request's `operations` in timestamp/FIFO order and returns:

```ts
interface SyncProgressResponse {
  results: SyncOperationResult[];
  currentState: UserRallyState;
  syncTimestamp: number;
}
```

`ACCEPTED` includes `resourceId`, `action`, and `appliedAt`. A
`REJECTED_PERMANENT` result includes `errorCode` and `reason`; a dependent
operation uses `REJECTED_PREREQUISITE_FAILED`. `FAILED_RETRYABLE` includes an
error string and must remain queued for a later request. Unexpected exceptions,
including adapter and per-operation validation exceptions, are converted to
`FAILED_RETRYABLE` for that operation. Permanent rejection or an exception in
one operation does not prevent independent operations later in the same batch;
only successful operations are reflected in `currentState`.

## Trusted authentication

Direct `checkIn`, `claimReward`, and `syncProgress` calls accept
`AuthInput = TrustedAuthContext | { userId: string } | string`. A string or
`{ userId }` is normalized to a `TrustedAuthContext`; production code should
pass a context created by verified authentication middleware. The normalized
context identity is authoritative and overrides a request body's `userId`.

```ts
import { normalizeAuthContext, type AuthInput } from "@stamprally/server";

const auth: AuthInput = { authenticatedUserId: session.userId, claims: session.claims };
await server.checkIn(request, auth);
await server.claimReward(claimRequest, "trusted-user"); // simplified form
const context = normalizeAuthContext({ userId: "trusted-user" });
```

## Inventory

`Reward.stockKey` names the primary inventory bucket. `Reward.secondaryStockKey`
names a second bucket that must be read, decremented, and committed atomically
with the primary bucket and the user claim. A persistence adapter must declare
`supportsSecondaryStock: true` and implement the corresponding transaction
write. Unsupported secondary persistence fails closed with
`SECONDARY_STOCK_UNSUPPORTED`.

## UI synchronization

`@stamprally/ui` exports `SyncStatusBanner`; `RallyViewer` accepts the
`showSyncStatus` and `renderSyncStatus` props. The viewer renders the standard
banner unless `showSyncStatus={false}`. `renderSyncStatus(status)` receives
`SyncStateContext` and can replace it with an application-specific banner.

## Storage capability

`client.queueCapability.multiTabSync` is `supported_web_locks` only when a usable
Web Locks API exists. It is `disabled_unsafe_environment` otherwise. In that
mode, automatic cross-tab synchronization is disabled; only an explicit sync
from the foreground tab runs. The client emits a `storageCapabilityWarning`
event and logs a warning. localStorage remains available as storage, but is not
used as an inter-tab lock. `queueCapability` also exposes `mode` (`persistent`
or `volatile_memory`), `isPersistent`, and the actual `storage` type.
