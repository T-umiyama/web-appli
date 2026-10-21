---
name: web-app-verify
description: HTMLアプリとホームの変更を検証し、実行結果と未確認事項を記録する。
---

# web-app-verify

対象アプリの仕様と今回の差分から必要な確認を選ぶ。
全体整合性はnode scripts/check-workspace.cjs、既存試験はnode --test tests/*.test.cjs。
画面はホームも全アプリもPC Chromeで確認する。PC画面幅とキーボード操作を対象とし、スマホ対応・検証は不要。
保存・失敗・取消・再読込は見た目と別に確認する。OSダイアログ等の未検証を明記する。
独立検証では製品・設定・文書を編集せず、主担当へ具体的な再現手順と証拠を返す。
主担当がdocs/verification.mdと未解決事項へ実際の結果を残す。原資料の合格件数を流用しない。
