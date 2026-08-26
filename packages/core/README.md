# @stamprally/core

Headless, storage-agnostic stamp rally engine for TypeScript and JavaScript.
The package contains the domain model, immutable state transitions, progress
calculation, persistence adapters, and browser sensor detectors.

## Install

```sh
npm install @stamprally/core
```

Or with pnpm:

```sh
pnpm add @stamprally/core
```

## Quick start

```ts
import {
  InMemoryStorage,
  StampRallyClient,
  type RallyConfig,
} from "@stamprally/core";

const config: RallyConfig = {
  id: "city-tour",
  title: "City Tour",
  stamps: [
    {
      id: "station",
      name: "Central Station",
      condition: { type: "token", token: "ARRIVED" },
    },
  ],
};

const client = new StampRallyClient(config, new InMemoryStorage());
await client.init();

const result = await client.acquire(
  "station",
  { type: "token", token: "ARRIVED" },
);

if (result.ok) {
  console.log(result.value.nextState.records);
} else {
  console.error(result.error.code);
}
```

`StampRallyClient` serializes operations, persists successful state changes, and
notifies subscribers with immutable state snapshots. Call `client.reset()` to
clear the current rally, or `client.restore(state)` to replace it with a
validated state for the same rally.

## Conditions

Stamp conditions support instant acquisition, tokens, geofences, recursive
combinations, and time windows:

```ts
const config: RallyConfig = {
  id: "museum-tour",
  isSequential: true,
  stamps: [
    { id: "entrance", name: "Entrance", condition: { type: "instant" } },
    {
      id: "gallery",
      name: "Gallery",
      condition: {
        type: "time_window",
        startsAt: "2026-04-01T09:00:00.000Z",
        endsAt: "2026-04-01T18:00:00.000Z",
        condition: { type: "geo", latitude: 35.6812, longitude: 139.7671, radiusMeters: 100 },
      },
    },
  ],
};
```

Use `calculateProgress(state, config)` to obtain the completion percentage,
remaining stamps, and next available stamps. For lower-level integrations,
`evaluateCondition`, `processStamp`, and `consumeReward` are also exported.

## Storage

All storage implementations satisfy the `StampStorage` interface:

- `InMemoryStorage` for tests, server-side rendering, or short-lived sessions.
- `LocalStorageAdapter` for browser LocalStorage persistence.
- `IndexedDBAdapter` for browser IndexedDB persistence.

```ts
import { LocalStorageAdapter, StampRallyClient } from "@stamprally/core";

const storage = new LocalStorageAdapter({
  keyPrefix: "my-app:",
  failureMode: "throw",
});
const client = new StampRallyClient(config, storage);
```

`LocalStorageAdapter` uses an instance-local in-memory fallback by default when
storage is unavailable, blocked, corrupt, or full. Use `failureMode: "throw"`
when the application must handle a typed `StorageAdapterError` instead.

Progress can also be exported and imported as a rally-scoped recovery token with
`exportProgressToken` and `importProgressToken`.

## Browser detectors

The optional detectors convert browser sensor output into a typed
`VerificationContext` and return a `Result` instead of throwing for unsupported
environments, permission failures, timeouts, and device errors.

```ts
import {
  getCurrentGeoContext,
  isGeolocationSupported,
  isNfcSupported,
  isQrSupported,
  readNfcContext,
  readQrContext,
} from "@stamprally/core";

if (isGeolocationSupported()) {
  const result = await getCurrentGeoContext({ enableHighAccuracy: true });
  if (result.ok) {
    await client.acquire("gallery", result.value);
  }
}

if (isNfcSupported()) {
  const result = await readNfcContext();
  if (result.ok) await client.acquire("entrance", result.value);
}

if (isQrSupported()) {
  const result = await readQrContext(videoElement, { facingMode: "environment" });
  if (result.ok) await client.acquire("entrance", result.value);
}
```

Geolocation, Web NFC, and camera access require a secure context and user
permission. Web NFC and `BarcodeDetector` are not available in every browser,
so applications should keep a manual-input fallback.

## Privacy and immutability

The domain engine does not depend on the DOM, React, or a specific persistence
implementation. State transitions never mutate their input. Verification inputs
such as tokens and coordinates are not copied into stamp record metadata by the
engine.

## License

MIT
