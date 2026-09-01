# Google 認証と進捗クラウド同期

`@stamprally/core` の同期機能は、Google OAuth/OIDC、Google Identity Services (GIS)、
独自の OIDC など特定の認証 SDK に依存しません。ホストアプリケーションが認証トークンを
検証し、`CloudSyncAdapter` で自分の API を接続します。

## 推奨フロー

1. 匿名セッションで `StampRallyClient` を作成し、通常どおりチェックインします。
2. GIS の `credential` callback で受け取った Google ID トークンをサーバーへ送ります。
3. サーバーで `createGoogleAuthContext(credential, { clientId })` を呼び、返された
   `TrustedAuthContext` を `StampRallyServer` の直接 API または HTTP middleware に渡します。
4. ホスト API が `CloudSyncAdapter.linkAccount` を実装し、Google の `sub` を `userId` として
   返します。クライアントは匿名のスタンプと未獲得報酬を認証済み state へイミュータブルに
   マージし、保留中の offline 操作もユーザーキューへ移します。
5. 必要に応じて `exportCloudSnapshot()` で署名済みの不透明なスナップショットを保存し、
   別デバイスでは `importCloudSnapshot()` でサーバー検証済み state を復元します。

```tsx
const { linkAccount, exportCloudSnapshot, importCloudSnapshot, syncProgress } =
  useStampRally(client);

// GIS callback: response.credential はブラウザーから自分の API へ TLS で送る
await linkAccount(response.credential, "google");
await syncProgress();
const signedSnapshot = await exportCloudSnapshot();
await importCloudSnapshot(signedSnapshot);
```

## Adapter の境界

`CloudSyncAdapter` は認証・保存方式を決めません。`linkAccount` はホスト API にトークン、
provider、匿名 state、保留中操作を渡し、API は認証済み `userId` と既存 state（任意）を返します。
`exportCloudSnapshot` の戻り値は署名付き不透明値として扱い、署名・暗号化・保存はサーバー側で
行ってください。ブラウザーで ID トークンや署名鍵をログ出力・永続化しないでください。

```ts
const cloudSyncAdapter: CloudSyncAdapter = {
  linkAccount: (request) => api.linkAccount(request),
  exportCloudSnapshot: (request) => api.exportSnapshot(request),
  importCloudSnapshot: (request) => api.importSnapshot(request),
};
```

Google ID トークンの検証では issuer、audience、`sub`、有効期限、発行時刻、RS256 署名を検証します。
フロントエンドから送られた `userId` をそのまま信用せず、常に検証済み context の
`authenticatedUserId` を永続化キーに使用してください。

## マージポリシー

既定の `union` はスタンプを集合として統合し、より進んだ reward state を採用します。
サーバー側の既存 reward state を優先したい場合は `mergePolicy: "authoritative_replay"` を
返してください。この場合も匿名側にしかないスタンプは補完されます。どちらのポリシーでも
入力 state は変更されません。

GIS のボタン表示、token の取得、アカウント表示はアプリケーションの責務です。
`AccountBackupBanner` と `CloudSyncButton` は callback だけを受け取るため、Google SDK を
ライブラリへ強制しません。
