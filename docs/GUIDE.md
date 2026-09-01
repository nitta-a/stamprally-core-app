# Stamp Rally v0.25.0 Guide

## Viewer

`@stamprally/ui` accepts a public configuration produced from an admin
configuration and can be customized without taking ownership of verification:

```tsx
import { RallyViewer } from "@stamprally/ui";

<RallyViewer
  config={publicConfig}
  locale="en"
  classNames={{ root: "rally", card: "spot-card", button: "cta" }}
  styles={{ root: { "--stamp-primary": "#7c3aed" } }}
  headerSlot={({ config, state }) => <header>{config.title} ({state.records.length})</header>}
  renderStatusBadge={({ status }) => <strong data-status={status}>{status}</strong>}
  renderSpotCard={({ spot, children }) => <article><h2>{spot.name}</h2>{children}</article>}
  renderSuccessFeedback={() => <p>Stamp added!</p>}
/>
```

`StampSheet` exposes the same card, slot, header, footer, class, and style
extension points for read-only progress views.

## Admin UI and headless editing

Use `AdminRallyEditor` for a ready-made form, or use the hooks in a CMS:

```tsx
const editor = useAdminRallyEditor(initialConfig);
editor.updateSpot("spot-1", { imageUrl: "https://cdn.example/spot.png" });
editor.updateReward("reward-1", { validUntil: "2030-01-01T00:00:00.000Z" });
```

`useSpotEditor` and `useRewardEditor` provide focused immutable updates and
removal operations. Descriptions and titles are locale maps, so editing one
locale retains the other values.

## Public configuration boundary

Keep the admin configuration on the server. Call `sanitizeAdminConfig` (or the
backwards-compatible `toPublicConfig`) before sending it to a browser:

```ts
const publicConfig = sanitizeAdminConfig(adminConfig);
const safety = validatePublicConfigSafety(publicConfig);
if (!safety.safe) throw new Error(`Private keys: ${safety.leakedKeys.join(", ")}`);
```

`serverMetadata`, inventory, staff passcodes, reward content URLs, and
condition proof values are removed. `publicMetadata` is the explicit public
metadata field; `metadata` remains supported for compatibility.

## Offline synchronization

Create an `OfflineQueue` with local storage (or provide a storage adapter),
pass it to `StampRallyClient`, and retry after connectivity returns:

```ts
const offlineQueue = new OfflineQueue({
  key: "rally:offline",
});
const client = new StampRallyClient(publicConfig, { syncAdapter, offlineQueue });
await client.retrySync();
console.log(client.syncState, client.pendingCount);
```

Failed check-ins and claims are retained by idempotency key and replayed in
order on top of the authoritative server snapshot. Rejected prerequisite
operations also invalidate dependent queued check-ins.

`queueCapability` reports the legacy storage string (`indexeddb`, `localstorage`,
`memory`, `custom`, or `disabled`). Use `queueCapabilities` for `storageType`,
`isPersistent`, and `multiTabSync`. Web Locks is used for cross-tab exclusion
only when supported; otherwise automatic cross-tab sync is disabled and the
foreground tab must trigger sync explicitly.

## Batch Sync and direct server APIs

`syncProgress` returns a `results` entry for every operation. A permanent
rejection or unexpected adapter/validation exception is isolated to that
operation; independent operations continue. Unexpected exceptions are returned
as `FAILED_RETRYABLE`, while the returned `currentState` contains only successful
mutations.

Direct server methods accept a verified `TrustedAuthContext`, `{ userId: string }`,
or a string `userId` for simplified trusted calls. Use the verified context in
production so claims and session information can cross the authentication
boundary.

## Server persistence

`ServerPersistenceAdapter.runTransaction` should delegate to the database's
transaction primitive. Adapters without native transactions should implement
`restoreRewardStock` and the rollback methods so a failed state, claim, or
audit write compensates earlier writes. Use a per-user lock for check-ins and
a per-reward lock for inventory claims. Redis implementations commonly use a
short lease plus an atomic decrement; RDBMS implementations use a row lock and
an ordinary transaction.

Never put server-only metadata in the public configuration or in client event
metadata.
