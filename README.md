# web-appli

機能別のHTML Webアプリをまとめるホーム。すべてPC Chrome向け。太い枠線、硬い影、鮮やかな色のNeo-Brutalismスタイルを使う。

`index.html`をChromeで開くとホームを表示します。「UI指摘ツール」と「スクショ注釈ツール」を登録済みです。
ローカルサーバーで開く場合：

```sh
python3 -m http.server 8780 --bind 127.0.0.1
```

`http://127.0.0.1:8780/`へアクセスします。ビルドやnpmのインストールは不要です。

## アプリを追加
1. `templates/html-app/`を`apps/<機能名>/`へコピーする。
2. HTML・CSS・JS・画像などの機能本体をそのフォルダ内へまとめる。資料は`docs/<機能名>/`へ置く。
3. `apps/registry.js`に1件追加する。ホームのカード・検索・カテゴリへ反映される。
4. `node scripts/check-workspace.cjs`と必要な動作確認を行う。

詳しくは[アプリの追加方法](apps/README.md)、[全体構成](docs/architecture.md)を参照。

## AIの設定
- 共通規約：[AGENTS.md](AGENTS.md)
- Claude固有：[CLAUDE.md](CLAUDE.md)
- チームと初回設定：[docs/agent-team.md](docs/agent-team.md)
- 引き継ぎ：[docs/AIhandoff/README.md](docs/AIhandoff/README.md)
- 検証：[docs/verification.md](docs/verification.md)

このフォルダでCodex / Claude Codeの新規セッションを開始してください。Codexのhookは`/hooks`から内容を確認して信頼します。チームの起動例：

> UI指摘ツールを改善して。画面・ロジック・検証の担当で分担し、最後に引き継ぎをまとめて。

Codexのスキルは`$web-app-team`、`$web-app-verify`、`$ai-handoff`。Claude Codeでは`/web-app-team`、`/web-app-verify`、`/ai-handoff`です。
