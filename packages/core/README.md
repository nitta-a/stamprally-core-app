# @stamprally/core

Dependency-free domain models, immutable state transitions, storage adapters, browser detectors, and configuration parsers.

## Setup

```sh
pnpm add @stamprally/core
```

```ts
import { InMemoryStorage, StampRallyClient, type PublicRallyConfig } from "@stamprally/core";

const config: PublicRallyConfig = {
  id: "city-tour",
  version: "1",
  title: "City Tour",
  spots: [{ id: "station", orderIndex: 0, name: "Central Station", conditions: [{ type: "passcode" }] }],
  rewards: [],
};
const client = new StampRallyClient(config, { storage: new InMemoryStorage() });
await client.init();
```

Use `client.checkIn(spotId, proof)` and `client.claimReward(rewardId)` for participant actions. Connect a `syncAdapter` for server verification; the local client does not verify secret passcodes or enforce authoritative inventory.

## Configuration and progress

- Keep `AdminRallyConfig` private and publish `toPublicConfig(adminConfig)`, which removes verification secrets and server-only data.
- Validate external JSON with `safeParseAdminConfig` / `safeParsePublicConfig`; errors include field paths.
- Configure prerequisites, completion conditions, availability, and reward requirements. Use `getNextSpotSuggestions` for navigation suggestions and `analyzeRallyExperience` for preflight checks.
- Use `InMemoryStorage`, `LocalStorageAdapter`, or `IndexedDBAdapter` for progress storage.

## Offline and cloud sync

Pass an `OfflineQueue` scoped by `rallyId` and `userId` to retain pending operations. Sync replays them against the server state: accepted and permanent results leave the queue, while retryable failures remain pending. `queueCapabilities` reports persistence and multi-tab support; without Web Locks, trigger synchronization explicitly from the foreground tab.

Account linking and snapshot backup use a host-provided `CloudSyncAdapter`. See the [Google auth and cloud sync guide](https://github.com/nitta-a/stamprally-core-app/blob/main/docs/GOOGLE_AUTH_SYNC.md) for an integration example.

## Browser detectors

`getCurrentGeoContext`, `readNfcContext`, and `readQrContext` return typed results for unsupported environments, permission failures, timeouts, and device errors. Keep manual input fallbacks.

See the [feature guide](https://github.com/nitta-a/stamprally-core-app/blob/main/docs/GUIDE.md) for configuration and customization details.

## License

MIT
