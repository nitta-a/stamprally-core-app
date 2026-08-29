# stamprally-core-app v0.21.0

A headless, storage-agnostic stamp rally engine with React, participant UI, authoring UI, and Web Standard server integration.

## Packages

- `@stamprally/core`: Domain models, immutable state transitions, storage adapters, browser detectors, public-config projection, and runtime parsers.
- `@stamprally/react`: The `useStampRally` React hook.
- `@stamprally/ui`: Accessible participant components including `RallyViewer` and `StampSheet`.
- `@stamprally/admin-ui`: Authoring forms for rally settings, spots, rewards, conditions, localization, and JSON import.
- `@stamprally/server`: Server-authoritative check-in and reward-claim handlers using Web Standard `Request`/`Response`.

## Requirements and commands

- Node.js 22 or later
- pnpm 11

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

## Minimal end-to-end setup

Keep `AdminRallyConfig` on the authoring/server side and publish only its safe projection:

```tsx
import { StampRallyClient, toPublicConfig, type AdminRallyConfig } from "@stamprally/core";
import { useStampRally } from "@stamprally/react";
import { RallyViewer } from "@stamprally/ui";

const adminConfig: AdminRallyConfig = {
  id: "city-tour",
  version: "0.21.0",
  title: { ja: "街歩きラリー", en: "City Tour" },
  spots: [
    {
      id: "station",
      orderIndex: 0,
      name: { ja: "中央駅", en: "Central Station" },
      conditions: [{ type: "passcode", code: "ARRIVED" }],
    },
  ],
  rewards: [],
};

const publicConfig = toPublicConfig(adminConfig);
const client = new StampRallyClient(publicConfig, { userId: null });

export function App() {
  useStampRally(client);
  return <RallyViewer config={publicConfig} client={client} locale="en" />;
}
```

`client.checkIn(spotId, proof, options?)` performs a check-in. `client.claimReward(rewardId, options?)` consumes an available reward. All timestamps are ISO 8601 strings and verification inputs are not stored in progress metadata.

## Runtime validation

Use the pure parsers at an untrusted JSON boundary. `safeParseAdminConfig` and `safeParsePublicConfig` return field-level paths such as `spots[0].conditions[1].latitude`; the `parse*` variants throw `ConfigValidationError` with the same errors.

```ts
import { safeParseAdminConfig } from "@stamprally/core";

const result = safeParseAdminConfig(JSON.parse(jsonText));
if (!result.success) {
  for (const error of result.errors) console.error(error.path, error.code, error.message);
}
```

## React and server integration

`useStampRally(client)` subscribes to immutable state updates and exposes `onCheckIn`, `onClaimReward`, synchronization, and user switching. `RallyViewer` accepts a `PublicRallyConfig`, a client, or a server-backed adapter. Supply a locale dictionary to translate labels, statuses, placeholders, and feedback messages.

Mount the server handler with Hono or any Web Standard router:

```ts
import { StampRallyServer } from "@stamprally/server";

const server = new StampRallyServer(adminConfig, persistence, {
  authenticate: (request) => request.headers.get("x-user-id"),
});

app.all("/api/*", async (context) => {
  const response = await server.handle(context.req.raw);
  return new Response(response.body, response);
});
```

Implement `ServerPersistenceAdapter` with rallyId-scoped locks, reward stock, idempotency, user state, claim records, and audit logs. Production deployments should use a transactional database or Redis primitives with equivalent atomicity.

For offline clients, use the scoped `OfflineQueue` key and return explicit
operation outcomes (`ACCEPTED`, `REJECTED_PERMANENT`, or `RETRYABLE_ERROR`). The
SQL transaction reference in `packages/server/src/examples/transaction.ts` shows
the required all-or-nothing reward claim writes.

Batch Sync returns one result per operation. Successful operations are applied,
permanent rejections are removed from the queue, and unexpected operation
exceptions are returned as `FAILED_RETRYABLE` so independent operations can
continue. `queueCapability` exposes `mode`, `multiTabSync`, `isPersistent`, and
`storage`; use the object properties in new code.

Direct server APIs accept a verified `TrustedAuthContext`, `{ userId: string }`,
or a string `userId` for simplified trusted calls. Production code should pass
the context produced by authentication middleware; the context identity takes
precedence over a request body's `userId`.

## Browser detectors

`getCurrentGeoContext`, `readNfcContext`, and `readQrContext` return typed `Result` values for unsupported browsers, permission failures, timeouts, and device errors. Check `isGeolocationSupported()`, `isNfcSupported()`, and `isQrSupported()` and retain manual input fallbacks.

## 日本語

このモノレポは、ストレージ非依存のスタンプラリーエンジン、React Hook、参加者向け Viewer、管理者向け Maker UI、Web Standard サーバーを提供します。管理用の `AdminRallyConfig` は公開せず、必ず `toPublicConfig(config)` で秘密情報を除去してから `RallyViewer` に渡してください。

設定を外部 JSON から読み込む場合は `safeParseAdminConfig` / `safeParsePublicConfig` を利用してください。エラーには `spots[0].conditions[1].latitude` のようなフィールドパスが含まれます。管理 UI の `dictionary` と `locale` でラベル・状態・入力案内を翻訳でき、`updateLocalizedField` は他言語の値を保持したまま更新します。

## License

MIT
