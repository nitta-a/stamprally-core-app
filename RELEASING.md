# リリース手順

このリポジトリのnpm/GitHubリリースは、`vX.Y.Z`形式のGitタグを`origin`へpushすると
`.github/workflows/publish.yml`が実行されます。

## 初回だけ必要な設定

1. npmで`@stamprally/core`、`@stamprally/react`、`@stamprally/ui`、`@stamprally/admin-ui`を公開できるアカウントまたはOrganizationを用意する。
2. npmの公開用Granular Access Tokenを作成する。アカウントで公開時の2FAを必須にしている場合は、CI公開を許可する設定のトークンを使う。
3. GitHubリポジトリの `Settings > Secrets and variables > Actions` に、トークンを `NPM_TOKEN` という名前のActions secretとして登録する。
4. GitHub Actionsがタグpushで実行できること、GitHub Actionsのworkflowが有効であることを確認する。

npm上で各パッケージを初回公開した後は、npmのTrusted Publisherに
`nitta-a/stamprally-core-app`、workflow filename `publish.yml`を登録し、OIDC方式へ移行できます。
その場合は`NPM_TOKEN`を削除し、workflowのnpm公開処理をTrusted Publishing対応の方式へ切り替えます。

## v0.4.0の公開

作業ツリーをクリーンにし、ローカルで検証を通してから、mainとタグをpushします。

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm package:check
pnpm release:check v0.4.0

git tag -a v0.4.0 -m "Release v0.4.0"
git push origin main
git push origin v0.4.0
```

タグpush後、workflowは次の順で処理します。

1. 依存関係をlockfileどおりにインストールする。
2. lint、型チェック、テスト、ビルドを実行する。
3. タグのバージョンと公開対象パッケージのバージョンを照合する。
4. `@stamprally/core`、`@stamprally/react`、`@stamprally/ui`、`@stamprally/admin-ui`をnpmへ公開する。
5. 同じタグのGitHub Releaseを生成し、自動生成のリリースノートを付ける。

同じタグでworkflowを再実行しても、npmに存在するバージョンと既存のGitHub Releaseはスキップします。
