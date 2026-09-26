# API reference

## `syncProgress`

`StampRallyServer.syncProgress(request, auth)` processes the
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
error string and must remain queued for a later request. Unexpected exceptions,
including adapter and per-operation validation exceptions, are converted to
`FAILED_RETRYABLE` for that operation. Permanent rejection or an exception in
one operation does not prevent independent operations later in the same batch;
only successful operations are reflected in `currentState`.

## Trusted authentication

Direct `checkIn`, `claimReward`, and `syncProgress` calls accept
`AuthInput = TrustedAuthContext | { userId: string } | string`. A string or
`{ userId }` is normalized to a `TrustedAuthContext`; production code should
pass a context created by verified authentication middleware. The normalized
context identity is authoritative and overrides a request body's `userId`.

```ts
import { normalizeAuthContext, type AuthInput } from "@stamprally/server";

const auth: AuthInput = { authenticatedUserId: session.userId, claims: session.claims };
await server.checkIn(request, auth);
await server.claimReward(claimRequest, "trusted-user"); // simplified form
const context = normalizeAuthContext({ userId: "trusted-user" });
```

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
used as an inter-tab lock. `queueCapability` also exposes `mode` (`persistent`
or `volatile_memory`), `isPersistent`, and the actual `storage` type.

## Navigation and completion

`SpotItem.location` is participant navigation metadata, not a check-in
condition. `getNextSpotSuggestions(state, config, options)` reuses progress
eligibility and supports `order` (default) or `nearest`; spots without a
location remain in the result. `RallyViewer` and `MuiRallyViewer` expose the
same `nextAction`, `onNavigate`, `renderNextAction`, `renderCompletion`, and
`onCompleted` extension points. The completion callback fires only on a
false-to-true transition, not for an already-completed initial state.

`completion` is optional and defaults to `{ condition: { type: "all_spots" } }`.
The other supported conditions are `stamp_count` and selected `stamps`; the
runtime parser rejects non-positive counts, empty/duplicate selections, and
unknown spot IDs.

## Availability, reward progress, and preflight

`RallyAvailability`, `SpotAvailability`, `WeeklyAvailability`,
`AvailabilityException`, and `AvailabilityHours` are optional public config
types. Weekly days use JavaScript weekday numbering (`0` is Sunday); hours use
24-hour `HH:mm` values and may cross midnight. Pass an ISO timestamp explicitly
to `evaluateRallyAvailability(availability, now)` or
`evaluateSpotAvailability(availability, now)`. These pure functions return an
`AvailabilityResult` whose status is `OPEN`, `CLOSED`, `UPCOMING`, or `ENDED`.
An absent availability setting evaluates to `OPEN`.

`getNextSpotSuggestions` supports `strategy: "order" | "nearest" |
"reward_goal"`, optional `rewardId`, and optional `now` plus
`availability: "open_first" | "exclude_closed"`. Existing callers that omit
these fields keep the old order/nearest behavior.

`calculateRewardProgress(rewardId, state, config)` returns `RewardProgress`
(`isUnlocked`, `acquired`, `required`, `percentage`, and `missingStampIds`), or
`undefined` for an unknown reward. `requiredStampCount` remains required, and
each configured unlock condition is additionally required. Top-level conditions
are ANDed. The same nested condition evaluation drives reward-state
reconciliation.

`simulateRallyProgression(config)` returns reachable spot IDs, unlockable reward
IDs, and completion reachability. `analyzeRallyExperience(config, options?)`
returns `ExperienceIssue[]` with severity, stable code, path, message, and
related IDs. It is an advisory pure analysis API; publication remains the host
application's responsibility.
