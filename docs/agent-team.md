# エージェントチーム

参照元の役割分担・直接連絡・独立検証を、HTMLアプリ集向けに調整した。
Codexは主担当がサブエージェントを統合し、ClaudeはAgent Teamsを利用する。異なる仕組みを同一機能と扱わない。

| 役割 | Codex | Claude | 担当候補 |
| --- | --- | --- | --- |
| 画面 | web_ui | web-ui | 対象アプリの画面・CSS・画面試験 |
| ロジック | web_domain | web-domain | 対象アプリの処理・データ検証 |
| API | web_backend | web-backend | 必要な場合だけAPI・サーバー |
| データ | web_data | web-data | 保存・読込・移行 |
| 検証 | web_verifier | web-verifier | 編集せず独立確認 |
| 調査 | web_explorer | web-explorer | 読取調査 |

単一HTMLでは画面・ロジック・保存が同じファイルになる。複数担当に同時編集させず、調査・試験を並行し、実装ファイルの持ち主は1人にする。
主担当は共有文書・登録一覧・判断・統合・引き継ぎを担当する。

## 流れ
1. 主担当が目的・担当・許可ファイル・依存・完了条件・検証・範囲外を割り当てる。
2. 担当同士がインターフェースを相談する。担当変更や決定は主担当へ戻す。
3. 実装と必要な試験を行い、変更・結果・未確認事項を日本語で報告する。
4. 実装が止まった後に独立検証する。修正した場合は該当部分を再確認する。
5. 主担当が差分と証拠を読み戻し、必要な記録と引き継ぎをまとめる。

## 初回設定
- このリポジトリで新規セッションを開始する。
- Codex：`.codex/config.toml`でagents有効、最大4子スレッド。役割は`.codex/agents/`。基本モデルは参照元を踏襲する。
- Codexの`/hooks`でhookとスクリプトを読み、信頼する。信頼操作を設定で迂回しない。
- Claude：`.claude/settings.json`の`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`で有効。対話セッションで役割を指定して依頼する。
- スキルは`.agents/skills/`を正本とし、`.claude/skills/`から相対リンクする。

## 完了hook
両ツールとも`scripts/verify-agent-completion.cjs`を呼ぶ。
全体チェックと`tests/*.test.cjs`の試験を行い、rootのpackage.jsonに定義済みなら`npm run check`・`npm run test`も実行する。各コマンドは60秒まで、全体のhookは300秒まで。
未定義は明示してスキップする。ブラウザや個別アプリの受入検証を合格にするものではない。
Codexは初回失敗を差し戻し、再継続でも失敗したら未完の理由を返して自動再試行を止める。
共有ファイル・権限・commit・外部送信の許可はチーム設定だけで広げない。

## 公式資料
- [Codex Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Codex Skills](https://learn.chatgpt.com/docs/build-skills)
- [Codex Hooks](https://learn.chatgpt.com/docs/hooks)
- [Claude Agent Teams](https://code.claude.com/docs/en/agent-teams)

2026-10-21に公式資料とローカルCLIを確認。設定の読込と実際のチーム起動は区別して記録する。
