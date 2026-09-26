# Stamp Rally v0.25.4 Guide

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

`SpotItem.location` is navigation metadata for participants; it does not turn
QR, NFC, passcode, or custom spots into GPS check-ins. The host owns maps and
route handling:

```tsx
<RallyViewer
  config={publicConfig}
  locale="en"
  nextAction={{ strategy: "nearest", currentLocation: { latitude: 35, longitude: 139 } }}
  onNavigate={(spot) => openHostRoute(spot.location)}
  onCompleted={(progress) => analytics.track("rally_completed", progress)}
/>
```

Set `completion` to `{ condition: { type: "stamp_count", count: 5 } }` or
`{ condition: { type: "stamps", stampIds: ["entrance", "museum"] } }` when
completion is not all spots. Omitted completion keeps the legacy all-spots
behavior.

`StampSheet` exposes the same card, slot, header, footer, class, and style
extension points for read-only progress views.

## Availability, reward goals, and preflight

Availability is optional. A rally can set ISO 8601 `startsAt` / `endsAt`
timestamps. A spot can define a timezone, weekday schedules (`dayOfWeek` uses
Sunday `0` through Saturday `6`), multiple `HH:mm` periods, and date-specific
closures or replacement hours. A closing time earlier than its opening time
continues into the next day. Unconfigured spots remain always open.

```ts
const availability = {
  timezone: "Asia/Tokyo",
  weekly: [{ dayOfWeek: 6, hours: [{ opensAt: "09:00", closesAt: "17:00" }] }],
  exceptions: [{ date: "2026-10-10", closed: true }],
};

const status = evaluateSpotAvailability(availability, "2026-10-03T02:00:00.000Z");
// { status: "OPEN" }
```

`evaluateRallyAvailability` and `evaluateSpotAvailability` are pure: pass the
instant explicitly. Config parsers validate timezone names, date ranges,
weekdays, times, and overlapping periods. Both editors expose rally date/time
fields and structured weekly/special-date inputs. Participant viewers display
availability, and `nextAction` prioritizes open spots; `availability:
"exclude_closed"` removes non-open suggestions.

`calculateRewardProgress(rewardId, state, config)` returns the unlock state,
percentage, and missing spot IDs. The legacy `requiredStampCount` remains in
effect; configured nested unlock conditions are additional requirements, with
top-level conditions combined using AND and nested `all` / `any` kept intact.
Set `nextAction={{ strategy: "reward_goal", rewardId: "prize" }}` to prioritize
the spots that satisfy that reward. The host still owns map navigation.

`simulateRallyProgression(config)` computes prerequisite reachability and
unlockable rewards. `analyzeRallyExperience(config, { targetLocales })` reports
errors, warnings, and info for unreachable spots, impossible completion or
rewards, missing translations, limited check-in fallbacks, and other usability
issues. `AdminRallyEditor` and `MuiAdminRallyEditor` show the report; hosts can
also gate publication with `issues.some(({ severity }) => severity === "error")`.

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
