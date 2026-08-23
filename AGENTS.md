# AGENTS.md

このファイルはリポジトリ全体に適用されます。より深いディレクトリに別の
`AGENTS.md` がある場合は、そちらの指示を優先してください。

## プロジェクト概要

このリポジトリは、TypeScript 製スタンプラリーエンジンの pnpm/Turborepo
モノレポです。

- `packages/core`: DOM・React・特定の永続化実装に依存しないドメインエンジン、
  ストレージアダプター、ブラウザーセンサーの Detector、クライアント API
- `packages/react`: `@stamprally/core` を利用する React Hook
- `apps/web`: Vite 製のデモ／フィールドテスト UI

Node.js 22.12 以上と pnpm 11 を使用してください。依存関係の操作には npm や
yarn ではなく pnpm を使い、`pnpm-lock.yaml` を正として扱います。

## 作業方針

- 変更前に関連する実装、テスト、公開 export を確認してください。
- ユーザーの未コミット変更を保持し、依頼と無関係な差分を変更・整形・削除しないで
  ください。
- 必要最小限の変更に留め、生成物の `dist/`、キャッシュ、`node_modules/` は
  コミット対象にしないでください。
- 公開 API、型、エラーコード、永続化形式を変更する場合は、後方互換性への影響を
  明示的に検討してください。
- 新しい機能や不具合修正には、該当パッケージの `test/` に Vitest のテストを追加・
  更新してください。

## アーキテクチャ上の制約

- `packages/core` のドメインロジックは純粋かつイミュータブルに保ちます。DOM、React、
  UI、特定のストレージ実装へ依存させないでください。
- 状態遷移では入力オブジェクトを直接変更せず、新しい状態と型付きの `Result`／
  イベントを返してください。
- ブラウザー API へ触れる処理は Adapter または Detector に隔離し、モジュールの
  import 時ではなく呼び出し時にのみグローバルへアクセスしてください。
- Detector は未対応環境、権限拒否、デバイスエラーを想定し、既存の型付き `Result`
  の規約に従って処理してください。
- `packages/react` は薄い連携層として保ち、ドメイン判定を重複実装しないでください。
- `apps/web` から共有可能なドメインルールを追加する場合は、まず `packages/core` に
  置くべきか検討してください。
- パッケージの公開要素を追加・変更した場合は、対応する `src/index.ts` の export と
  型定義ビルドを確認してください。

## コーディング規約

- TypeScript の strict 設定を維持し、`any` や不要な型アサーションで型エラーを
  回避しないでください。
- `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、未使用チェックを前提に
  実装してください。
- 既存のタグ付きユニオンと型の絞り込みを優先し、網羅性を保ってください。
- Biome の設定に従い、スペース 2 個、ダブルクォート、セミコロンあり、行幅 100、
  trailing comma ありで記述してください。
- 日時は既存 API と同様に ISO 8601 文字列として扱ってください。
- トークン、座標などの検証入力や機密になり得る値を、ログやスタンプレコードの
  metadata に意図せず保存しないでください。

## 検証コマンド

リポジトリルートで、変更範囲に応じて次を実行してください。

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

反復中は対象を絞って構いません。

```sh
pnpm --filter @stamprally/core test
pnpm --filter @stamprally/react test
pnpm --filter @stamprally/web test
```

完了時には、実行したコマンドと結果、実行できなかった検証があればその理由を報告して
ください。
