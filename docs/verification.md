# 検証記録

実行結果はここに追記する。ユーザー提供資料にある過去の合格件数を今回の結果として扱わない。

## 2026-10-21 初期構成と2アプリ

### 共通設定
- `node scripts/check-workspace.cjs`：合格。HTML 4件、JS/CJS 9件、inline script 2件、登録アプリ2件。登録先・相対リンク・構文・設定JSONを確認。
- `node --test tests/*.test.cjs`：14件合格。登録IDの安全性・検索・チェッカーの異常検出・hookの失敗/タイムアウト/再継続・保存されたイベントcwdの無視・リポジトリ試験失敗の差戻しを確認。
- TOML 7件をPython標準のtomllibで解析。両指示ファイルのAI引き継ぎ節が一致し、3つの共有スキルの相対リンクが有効なことを確認。
- スキルの標準quick_validate.pyはPyYAML未導入で実行できなかった。代わりにRuby標準YAMLで3件のfrontmatter・必須項目・名称を検証し、内容と参照先を読み戻した。
- `codex debug prompt-input`：実際のローカルAGENTS、6役割、3スキルの読み込みを確認。sandbox内では権限エラーとなり、承認された通常権限で再実行して成功した。
- ローカルCLIはCodex 0.163.0 / Claude Code 2.1.306。`--strict-config`はこのバージョンの`debug`では非対応だったため、読み込み確認では使用していない。
- 両ツールのhook入口へ実イベントJSONを渡し、全体チェックと14件の試験が通ることを確認。package.jsonがないためnpm check/testは未定義としてスキップし、合格とは扱っていない。
- Codex側で実際に担当を分けて移植・検証を実施した。Claude Agent Teamsの対話起動とCodexのhook自動発火・信頼は新規の対話セッションで別途確認する。

### ホーム
PC Google Chrome 155.0.8059.85のfile://で、2件表示、名前/タグ検索、カテゴリ、空結果の解除、両アプリとひな形への往復、キーボードフォーカス、1440pxの表示を確認。ブラウザ例外なし。
スクリーンショットを読み戻し、Neo-Brutalismの枠線・配色・影と表示を確認した。証拠は`test-results/home/`。
ユーザーの最終指定により、以後の対象はホームを含めPCのみ。

### UI指摘ツール
独立担当がPC Chromeで28項目すべて合格を確認。file://でのフォルダ/HTML取込、複数HTML選択、CSS import/url、画像・JS・fetch・動的画像、選択の切替と抑止、連続指摘、空指摘、欠番、Undo、スクロール、要素状態、Markdownの一意なセレクタと推定行、別対象の確認、保存失敗/取消時の保持、IndexedDB復元を確認した。
HTTPでOPFSのHandleを使い、元ファイル更新後の再読込・スクロール維持・Handle保存と自動再開も確認。未処理pageerrorなし。
証拠は`test-results/ui-review-tool/review.cjs`、`results.json`と画面画像。

### スクショ注釈ツール
独立担当がPC Chromeで15項目合格を確認。元ファイルのscriptブロックは完全一致。画像入力、全ツール、日本語文字の確定、移動・色編集、Undo/Redo、ズーム、PNGダウンロード、画像を保つ注釈クリア、再読込時の非永続化を確認した。
Ctrl/Command+CのコピーAPI成功経路はモックで確認。ブラウザ例外なし。画面と出力PNGを読み戻した。
証拠は`test-results/screenshot-annotator/`。操作と保存方式の詳細は[アプリの説明](screenshot-annotator/README.md)。

### 実機での未確認
OSネイティブのファイル/フォルダ選択、Finderからのドロップ、実ファイルHandleの許可プロンプトとブラウザ終了を跨ぐ永続許可、実OSクリップボードの権限・画像貼付、日本語IMEの実操作。
合成fixtureとOPFSによる自動確認は、これらの実機操作の成功を意味しない。
