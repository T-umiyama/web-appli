# 全体構成

ホーム → 機能別HTMLアプリ、という静的な構成。サーバー・ビルド・外部ライブラリは必須にしない。

- ホーム：`index.html`、`assets/home.css`、`assets/catalog.js`、`assets/home.js`。
- 登録一覧：`apps/registry.js`。通常のscriptとして読み、file://でも動作する。
- アプリ：`apps/<id>/index.html`。CSS・JS・画像など機能本体もこのフォルダへまとめ、各アプリが個別の正本・保存方式を定義する。
- 最初のアプリ：`apps/ui-review-tool/index.html`。単一HTML。IndexedDBを正本とする。
- 全体の指示・判断・試験記録・引き継ぎ：ルートの`AGENTS.md`と`docs/`。
- 個別資料：`docs/<id>/`。ユーザー提供の原資料は`docs/ui-review-tool/ui-review-tool_HANDOFF.md`。
- スクリーンショット注釈ツール：`apps/screenshot-annotator/index.html`。資料は`docs/screenshot-annotator/`。画像は実行中のメモリで保持し、PNGを明示的に保存する。

サブアプリ間でDOM・状態・保存領域を暗黙に共有しない。共通化は実際に必要な箇所だけ行う。
UI指摘ツールのプレビューは、利用者が読み込んだHTML/JSを実行する。信頼できる手元のアプリに使用する。
プレビューとツールは同一オリジンで動作するため、隔離実行環境とは扱わない。
