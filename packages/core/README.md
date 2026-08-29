# @stamprally/core v0.18.0

Dependency-free domain models, immutable state transitions, storage adapters, browser detectors, and safe configuration parsers.

```ts
import { InMemoryStorage, StampRallyClient, type PublicRallyConfig } from "@stamprally/core";

const config: PublicRallyConfig = {
  id: "city-tour",
  version: "0.18.0",
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

## v0.17.0 offline synchronization

Configure `OfflineQueue` with `rallyId` and `userId` to persist pending work under
`stamprally:queue:<rallyId>:<userId-or-anonymous>`. `switchUser` loads the other
user's queue. The default `authoritative_replay` policy uses the server state as
the conflict baseline; `merge` is retained only as an explicit compatibility
option, and `server_wins` uses the server state unchanged. Sync adapters may return `ACCEPTED`, `REJECTED_PERMANENT`,
or `RETRYABLE_ERROR`; only the first two remove an operation.

When no authenticated user is supplied, the client creates a persistent UUID v4
`anonymousSessionId` and includes it in sync requests. Queue replay uses Web Locks
when available and supports bounded exponential backoff through `retryOptions`.

`evaluateSpotStatus` derives `UNCLAIMED`, `CLAIMED`, `LOCKED`, or `VERIFYING`
without mutating state. A spot with incomplete `prerequisites` is `LOCKED` and
must not be verified by a client or viewer.

## License

MIT
