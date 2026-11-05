# 導入ガイド / Getting started

React の画面で、1 スポットの設定からチェックインまで試します。Node.js 22 以上と pnpm を使います。

This local example creates one spot and checks in through a React UI. It requires Node.js 22 or later and pnpm.

## 1. アプリを作成 / Create an app

```sh
pnpm create vite stamp-rally-demo --template react-ts
cd stamp-rally-demo
pnpm install
pnpm add @stamprally/core @stamprally/react @stamprally/ui
```

## 2. 設定と画面を用意 / Add configuration and UI

`src/App.tsx` を次の内容に置き換えます。 / Replace `src/App.tsx` with:

```tsx
import {
  type AdminRallyConfig,
  InMemoryStorage,
  StampRallyClient,
  toPublicConfig,
} from "@stamprally/core";
import { RallyViewer } from "@stamprally/ui";
import "@stamprally/ui/styles.css";

const adminConfig: AdminRallyConfig = {
  id: "city-tour",
  version: "1",
  title: "街歩きラリー",
  spots: [
    {
      id: "station",
      orderIndex: 0,
      name: "駅前",
      conditions: [{ type: "passcode", code: "OPEN" }],
    },
  ],
  rewards: [],
};

const publicConfig = toPublicConfig(adminConfig);
const client = new StampRallyClient(publicConfig, { storage: new InMemoryStorage() });

export default function App() {
  return <RallyViewer config={publicConfig} client={client} locale="ja" />;
}
```

`RallyViewer` がクライアントを初期化します。クライアントはコンポーネントの外で作り、再描画時も同じインスタンスを使います。

`RallyViewer` initializes the client. Creating it outside the component keeps the instance stable across renders.

## 3. 試す / Try it

```sh
pnpm dev
```

表示されたローカル URL を開き、「駅前」のパスコード欄に `OPEN` を入力してチェックインします。取得済みの表示と進捗が更新されます。メモリー保存のため、ページを再読み込みすると進捗は消えます。

Open the local URL printed by Vite, enter `OPEN` for the spot, and check in. The collected status and progress update. Progress is kept in memory and is lost when the page reloads.

## 本番環境へ進む前に / Before production

この例の設定はブラウザーに含まれます。**実際の秘密情報を入れないでください。** ローカルクライアントは空でない合言葉を受け付け、`OPEN` との一致を検証しません。

本番では `AdminRallyConfig` をサーバーだけに置き、`toPublicConfig` の結果だけをブラウザーに渡してください。認証、チェックインの検証、特典在庫はサーバーで管理し、クライアントをサーバー連携アダプターに接続します。永続化が必要ならストレージアダプターも用意します。[セキュリティモデル](SECURITY_MODEL.md)、[サーバーパッケージ](../packages/server/README.md)、[連携例](../examples) を参照してください。

The configuration in this example is shipped to the browser; **do not put real secrets in it**. The local client accepts any non-empty passcode and does not check it against `OPEN`.

In production, keep `AdminRallyConfig` on the server and send only the `toPublicConfig` result to the browser. Handle authentication, check-in verification, and reward inventory on the server, and connect the client to a server-backed adapter. Add a storage adapter if progress must persist. See the [security model](SECURITY_MODEL.md), [server package](../packages/server/README.md), and [examples](../examples).
