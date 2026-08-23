# stamprally-core-app

A headless, storage-agnostic stamp rally engine and React integration for TypeScript/JavaScript.

## Packages

- `@stamprally/core`: dependency-free domain types, condition evaluation, immutable state transitions, progress calculation, and a storage-agnostic client.
- `@stamprally/react`: the `useStampRally` React hook.
- `@stamprally/web`: a small Vite demo that exercises sequential token stamps.

## Requirements

- Node.js 22.12 or later
- pnpm 11

## Commands

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm dev
```

The development command starts the package build watchers and the Vite application. Open the URL printed by Vite. The demo uses in-memory storage, so progress is reset when the page reloads.

## Core API example

```ts
import {
  InMemoryStorage,
  StampRallyClient,
  type RallyConfig,
} from "@stamprally/core";

const config: RallyConfig = {
  id: "city-tour",
  stamps: [
    {
      id: "station",
      name: "Central Station",
      condition: { type: "token", token: "ARRIVED" },
    },
  ],
};

const client = new StampRallyClient(config, new InMemoryStorage());
await client.initialize();

const result = await client.acquire(
  "station",
  { type: "token", token: "ARRIVED" },
  new Date().toISOString(),
);

if (!result.ok) {
  console.error(result.error.code);
}
```

All engine timestamps are ISO 8601 strings. Verification inputs such as tokens and coordinates are not copied into stamp record metadata.
