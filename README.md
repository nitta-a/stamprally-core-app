# stamprally-core-app

A headless, storage-agnostic stamp rally engine with React integration for TypeScript/JavaScript.

## Packages

- `@stamprally/core`: Dependency-free domain types, detailed condition evaluation, immutable state transitions, progress calculation, browser storage adapters, and a storage-agnostic client.
- `@stamprally/react`: The `useStampRally` React hook.
- `@stamprally/web`: A Vite field-test UI for instant, QR-token, GPS, sequential, and free-mode acquisition.

## Requirements

- Node.js 22.12 or later
- pnpm 11

## Setup and commands

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm dev
```

`pnpm dev` starts the package build watchers and the Vite application. Open the URL printed by Vite.

The demo persists progress in LocalStorage. Use **Clear State** to remove it. GPS presets remain available when browser geolocation is unavailable or denied.

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

## Storage

`InMemoryStorage`, `LocalStorageAdapter`, and `IndexedDBAdapter` implement the same `StampStorage` contract.

Call `client.reset()` to remove persisted progress and notify subscribers with a new empty state.

## Design principles

- `@stamprally/core` contains pure domain logic and does not depend on the DOM, React, browser APIs, or a specific persistence layer.
- Conditions use discriminated unions and support recursive token, geo, composite, and time-window evaluation.
- State transitions never mutate their input and return a `Result` together with events.

---

# stamprally-core-app（日本語）

TypeScript/JavaScript向けの、ヘッドレスかつストレージ非依存なスタンプラリー判定エンジンとReact連携です。

## パッケージ

- `@stamprally/core`: 実行時依存ゼロのドメイン型、詳細な条件判定、イミュータブルな状態遷移、進捗計算、ブラウザストレージアダプタ、ストレージ非依存Clientを提供します。
- `@stamprally/react`: `useStampRally` React Hookを提供します。
- `@stamprally/web`: Instant、QRトークン、GPS、Sequential、Freeモードを検証できるViteデモアプリです。

## 必要環境

- Node.js 22.12以降
- pnpm 11

## セットアップとコマンド

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm dev
```

`pnpm dev` はパッケージのwatchビルドとViteアプリを起動します。Viteが表示するURLを開いてください。

デモの進捗はLocalStorageに保存されます。保存状態を削除するには **Clear State** を押してください。ブラウザの位置情報が利用できない場合や拒否された場合も、GPSプリセットで検証できます。

## Core APIの例

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

エンジンが扱う日時はすべてISO 8601文字列です。トークンや座標などの検証入力は、スタンプレコードのmetadataへ自動保存されません。

## ストレージ

`InMemoryStorage`、`LocalStorageAdapter`、`IndexedDBAdapter` は同じ `StampStorage` 契約を実装します。

`client.reset()` を呼ぶと永続化された進捗を削除し、購読者へ空の新しい状態を通知します。

## 設計方針

- `@stamprally/core` はDOM、React、ブラウザAPI、特定の永続化層に依存しない純粋なドメインロジックです。
- 条件はタグ付きユニオンで表現し、token、geo、composite、time windowを再帰的に評価します。
- 状態遷移は入力状態を変更せず、`Result` とイベントを返します。
