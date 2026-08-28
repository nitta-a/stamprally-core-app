# @stamprally/core

Dependency-free domain models, immutable state transitions, storage adapters, browser detectors, and safe configuration parsers.

```ts
import { InMemoryStorage, StampRallyClient, type PublicRallyConfig } from "@stamprally/core";

const config: PublicRallyConfig = {
  id: "city-tour",
  version: "0.9.1",
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

## License

MIT
