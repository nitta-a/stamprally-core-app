# Architecture and public API

The repository exposes one domain model. `SpotItem`, `Reward`, and `RallyConfig`
are the participant-facing names; `AdminRallyConfig` is the server-side authoring
shape and `PublicRallyConfig` is its safe browser projection.

## Core

`@stamprally/core` owns immutable state transitions, condition evaluation,
localized text, browser detectors, storage adapters, `StampRallyClient`, and the
runtime `assertPublicConfig` guard. `toPublicConfig` is the only projection from
admin data to public data. Secret tokens, passcodes, custom secret parameters,
and `serverMetadata` never cross that boundary.

## Server

`@stamprally/server` owns authenticated request handling and persistence. Its
`StampRallyServer.claimReward` flow checks idempotency, acquires a reward lock,
checks the per-user limit, decrements stock, saves user state, writes an audit
entry, stores the idempotent response, and releases the lock. A persistence
failure restores the decremented stock.

## React

`@stamprally/react` is a thin subscription adapter. `useStampRally` exposes the
client state and operations, including `switchUser` and `clearUserState`.

## UI and Admin UI

`@stamprally/ui` renders `RallyViewer` from `PublicRallyConfig`. Every condition
renderer can be replaced through `customConditionRenderers`; labels are supplied
through `LocaleDictionary<TLocale>`. `@stamprally/admin-ui` edits only
`AdminRallyConfig` and never publishes it directly.
