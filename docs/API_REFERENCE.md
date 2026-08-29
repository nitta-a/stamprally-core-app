# API reference

## `syncProgress`

`StampRallyServer.syncProgress(request, trustedAuthContext)` processes the
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
error string and must remain queued for a later request. Permanent rejection of
one operation does not prevent independent operations later in the same batch.

## Trusted authentication

Direct `checkIn`, `claimReward`, and `syncProgress` calls require a
`TrustedAuthContext` with a verified `authenticatedUserId`. The context is the
authoritative identity and cannot be replaced by a request body's `userId`.

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
used as an inter-tab lock.
