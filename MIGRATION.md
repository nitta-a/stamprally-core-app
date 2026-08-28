# v0.7.0 migration guide

v0.7.0 introduces the Universal Model as the common boundary between Maker,
Viewer, client, React, and server packages. Existing APIs remain available for
the current release, but new integrations should use the universal types.

## Mapping

| Legacy API | Universal API |
| --- | --- |
| `RallyConfig.stamps` | `AdminRallyConfig.spots` |
| `SpotItem.condition` | `UniversalSpotItem.conditions[]` |
| `SpotItem.order` | `UniversalSpotItem.orderIndex` |
| `RewardItem` | `AdminReward` / `PublicReward` |
| `StampRallyClient.acquire` | `UniversalStampRallyClient.checkIn` |
| `useStampRally` | `useUniversalStampRally` |

Use `migrateRallyConfig()` for legacy input and `toPublicRallyConfig()` before
shipping configuration to a participant. The public projection removes QR
secrets, passcodes, custom secret parameters, and digital reward content.

`RallyConfig`, `SpotItem`, `StampDefinition`, and the legacy React hook are
deprecated for new code. They are retained so existing applications can move
incrementally.

## Client adapter

```ts
const client = new UniversalStampRallyClient(publicConfig, {
  storage: new LocalStorageAdapter(),
  customValidators: { membership: async (context) => ({ success: true }) },
});
await client.checkIn("spot-1", { token: "..." });
await client.sync();
```

For React, pass the hook result to a viewer adapter or use the returned
`onCheckIn`, `onClaimReward`, and `onSync` handlers directly.

## Server identity boundary

Configure `UniversalRallyServer({ authenticate })` with the application’s JWT
or session verifier. The verifier must return the authenticated subject. The
HTTP handlers ignore a client-supplied `userId` whenever authentication is
configured; a client cannot check in or claim against another user by changing
JSON. See `examples/hono-api-server` for a Hono wiring example.
