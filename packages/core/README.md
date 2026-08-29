# @stamprally/core v0.21.0

Dependency-free domain models, immutable state transitions, storage adapters, browser detectors, and safe configuration parsers.

```ts
import { InMemoryStorage, StampRallyClient, type PublicRallyConfig } from "@stamprally/core";

const config: PublicRallyConfig = {
  id: "city-tour",
  version: "0.21.0",
  title: "City Tour",
  spots: [{ id: "station", orderIndex: 0, name: "Central Station", conditions: [{ type: "passcode" }] }],
  rewards: [],
};
const client = new StampRallyClient(config, new InMemoryStorage());
await client.init();
const result = await client.checkIn("station", "ARRIVED");
```

Use `toPublicConfig(adminConfig)` to remove QR tokens, passcodes, NFC identifiers, custom secret parameters, staff credentials, and gated digital content before sending configuration to a browser. Use `safeParseAdminConfig` and `safeParsePublicConfig` at JSON boundaries; failures include paths such as `spots[0].conditions[1].latitude`.

The browser detectors `getCurrentGeoContext`, `readNfcContext`, and `readQrContext` return typed results and do not throw for unsupported environments, denied permissions, timeouts, or device errors. Keep manual fallbacks for browsers without Web NFC or `BarcodeDetector`.

`InMemoryStorage`, `LocalStorageAdapter`, and `IndexedDBAdapter` implement `StampStorage`. `updateLocalizedField` updates one locale without dropping existing translations.

## v0.21.0 offline synchronization

Configure `OfflineQueue` with `rallyId` and `userId` to persist pending work under
`stamprally:queue:<rallyId>:<userId-or-anonymous>`. `switchUser` loads the other
user's queue. The default `authoritative_replay` policy uses the server state as
the conflict baseline; it is the only supported conflict policy. Sync adapters may return `ACCEPTED`, `REJECTED_PERMANENT`,
or `RETRYABLE_ERROR`; only the first two remove an operation.

When no authenticated user is supplied, the client creates a persistent UUID v4
`anonymousSessionId` and includes it in sync requests. Queue replay uses Web Locks
when available and supports bounded exponential backoff through `retryOptions`.

### v0.21.0 batch sync, queue capability, and storage capability

An adapter can return `SyncProgressResponse` from `sync` when it sends queued
operations to a server-side `syncProgress` endpoint. The adapter passes queued
operations to its transport and maps the server request shape as needed:

```ts
const batchAdapter: SyncAdapter = {
  sync: async ({ rallyId, userId, state, operations }) =>
    postBatch({ rallyId, userId, state, operations }),
};
await client.sync(batchAdapter);
```

Each `SyncOperationResult`
is `ACCEPTED`, `REJECTED_PERMANENT`, or `FAILED_RETRYABLE`. Accepted and permanent
results are removed from the queue; permanent reasons are added to
`rejectedHistory`, while retryable operations are kept for the next send. A
permanent prerequisite failure does not prevent later independent operations from
being evaluated.

`client.queueCapability.multiTabSync` is `"supported_web_locks"` when the Web
Locks API is available. Otherwise it is `"disabled_unsafe_environment"`:
cross-tab automatic synchronization is disabled, the foreground tab must trigger
sync explicitly, and a `storageCapabilityWarning` event is emitted. localStorage
may still be used for durable queue data, but it is never used as a lock.

`client.queueCapability` also exposes `mode` (`"persistent"` or
`"volatile_memory"`), `isPersistent`, and the actual `storage` type. The
deprecated `legacy` property and `getLegacyQueueCapability` helper expose
`"persistent"` or `"volatile"` while callers migrate to `mode`.

`evaluateSpotStatus` derives `UNCLAIMED`, `CLAIMED`, `LOCKED`, or `VERIFYING`
without mutating state. A spot with incomplete `prerequisites` is `LOCKED` and
must not be verified by a client or viewer.

## License

MIT
