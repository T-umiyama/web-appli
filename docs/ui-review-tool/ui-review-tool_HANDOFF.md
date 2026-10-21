# UI指摘ツール 引き継ぎ

- 対象ファイル: `ui-review-tool.html`（単一HTML・外部ライブラリなし・約1200行）
- 作成日: 2026-10-21
- 段階: Phase1（MVP）完了。ヘッドレスChromeで自動検証済み、実機での確認は未実施

---

## 0. 結論（現状）

- 確定要件はすべて実装済みだ。自動テストは49項目すべて通っている。
- 未検証なのは、OSのフォルダ選択ダイアログ、OSからのドラッグ&ドロップ、アクセス許可のプロンプトの3点だ。いずれもブラウザ自動化では操作できない。
- 次の一手は、実機のChromeでセクション7の「未検証事項」を確認することだ。

---

## 1. 目的

- HTMLで作ったWebアプリのUIに、要素単位で指摘を入れる。
- 指摘を「AIが要素を確実に特定できるMarkdown」として出力し、AIコーディングエージェントに渡す。
- AIが修正した後は「再読込」を押し、同じ番号のまま修正結果を確認する。

---

## 2. 確定要件（ユーザー決定事項）

| 項目 | 決定内容 |
|---|---|
| 形式 | 単一HTML。対象はPCのChromeのみ |
| 取り込み | HTML単体またはフォルダ。ファイル選択とドラッグの両方に対応する。フォルダの場合は、HTML内の相対パスに従ってCSS・JS・画像を自動で読み込む |
| 選択モード | 既定はOFFで、アプリを普通に操作できる。`Q`でON/OFFを切り替える。ON中は連続して指摘できる（1件ごとにOFFに戻らない） |
| 選択の使用感 | Chrome DevToolsと同じ。ホバーで青ハイライトとラベルを出し、クリックで確定する |
| マーカー | 赤枠と番号。番号は削除しても振り直さない |
| 入力 | 「指摘」の1欄のみ。優先度はなし |
| 右リスト | 番号・要素の要約・指摘を並べる。クリックでその要素へスクロールする。個別に削除できる。要素の状態（非表示／要素なし）を表示する |
| 保持 | リセットボタンを押すか、別のフォルダを読み込むまで保持する（IndexedDB） |
| 別フォルダ読込 | 「削除されます。よろしいですか？」の確認を出し、OKなら既存の指摘を削除する |
| 出力 | AI向けのMarkdownをクリップボードへコピーする。フォーマットはClaudeが設計した（セクション5） |

### 実装時にClaudeが決めた細部

- 入力欄を空のまま確定すると、その指摘は破棄する。破棄した番号が最新番号なら、次の指摘で再利用する
- 削除した指摘は、6秒間だけ「元に戻す」で復元できる
- 同じフォルダでも別のHTMLを選んだ場合は「別の対象」とみなし、削除の確認を出す
- リセットしても読み込んだページは残す。消すのは指摘と番号だけだ

---

## 3. 操作仕様

| 操作 | 挙動 |
|---|---|
| `Q` | 選択モードを切り替える。入力欄にフォーカスがある時、修飾キーを押している時、IME変換中、ダイアログ表示中は無効。フォーカスがiframe内にあっても効く |
| `Esc`（選択モード中） | 選択モードを終了する |
| 要素クリック（選択モードON） | 指摘を作成し、右リストの入力欄にフォーカスする。指摘済みの要素をクリックした場合は、既存の指摘を開く |
| `Enter` / `Shift+Enter` | 指摘を確定する／改行する |
| ホイール（選択モードON） | 対象アプリをスクロールする。カーソル位置のスクロール可能な祖先要素を優先する |
| 番号バッジのクリック | その指摘をアクティブにする |
| 右リストのクリック | その要素へスクロールし、赤枠を点滅させる |
| 再読込 | ファイルを読み直す。指摘とスクロール位置は維持する |

---

## 4. アーキテクチャ

### 処理の流れ

```
[フォルダ/HTML選択 or ドロップ]
   ↓ source = {kind:'dir'|'file'|'files', ...}
openSource() … HTMLの列挙・選択、同一対象かの判定、削除確認
   ↓
render() → buildHtml()
   ├ DOMParserで解析
   ├ markLines(): 全要素にHTMLソースの行番号を data-uir-l 属性で付ける
   ├ 相対参照（link/script/img/srcset/SVG use/style属性/<style>）を blob URL に置換
   │    └ CSSは再帰的に url() と @import を置換（循環ガードあり）
   ├ CSPの<meta>を除去
   └ <head>の先頭に SHIM（fetchとMutationObserverの補助）を注入
   ↓
iframe.srcdoc = 組み立てたHTML（親と同一オリジンのため、contentDocumentへ直接アクセスできる）
   ↓ loadイベント
キー・リンク・submit・ドロップのガードを登録し、指摘を要素に再結合（resolveAnn）
   ↓
requestAnimationFrameのループ: 赤枠・番号・ホバー枠を親側のoverlayに描画する
```

### レイヤー構成（`#frameWrap`内）

1. `#frame`: 対象アプリのiframe
2. `#overlay`: 赤枠とホバー枠。`pointer-events:none`で、番号バッジだけクリックできる
3. `#glass`: 選択モード中だけ表示する透明な板。ポインタイベントをすべて受け止め、`elementFromPoint`で要素を特定する

### 主要な設計判断

| 判断 | 理由 |
|---|---|
| マーカーをiframe内ではなく親側に描く | アプリのDOMを汚さないためだ。iframe内に描くと`nth-of-type`がずれ、出力するセレクタが壊れる |
| 選択モードでは`glass`がイベントをすべて受け止める | アプリ側のcaptureリスナーより確実に、クリックをアプリに渡さずに済む |
| 表示に`srcdoc`を使う | file://（不透明オリジン）でも親と同一オリジンになり、blob URLとcontentDocumentが使えるためだ。検証済み |
| Service Workerは使わない | file://では使えないためだ |
| ファイルは参照（Handle）を保存し、毎回読み直す | 「再読込」でAIの修正を即座に反映させるためだ |
| 番号は振り直さない | AIとの会話で「#3」が指す要素がずれるのを防ぐためだ |
| 行番号は推定値とする | DOMParserはソース位置を持たない。開始タグの並びと要素の並びを突き合わせて推定している |

---

## 5. 出力フォーマット

````markdown
# UI修正指示

- 対象: index.html（フォルダ: sample-app）
- 指摘: 3件（#1, #3, #4）。欠番は削除済みの指摘
- 確認時の表示領域: 1030×797px

## 対応ルール
1. 指摘は番号ごとに独立している。1件ずつ対応する。
2. 対象要素は「セレクタ」で特定する。セレクタはJS実行後のDOMから取得している。一致しない場合は「ソース位置」「HTML抜粋」「祖先」で照合する。
3. 要素を特定できない指摘は推測で修正しない。番号と理由を報告する。
4. 指摘と無関係な箇所は変更しない。
5. 完了後、番号ごとに「対応内容」と「変更したファイル」を1行で報告する。

---

## #1 `button#save.btn.btn-primary`「保存」

> 押しても反応が見えない

- セレクタ: `#save`
- ソース位置: index.html 12行目付近（推定）
- 祖先: `body > header.top > div.toolbar > button#save.btn.btn-primary`
- HTML抜粋:
```html
<button id="save" class="btn btn-primary">保存</button>
```
````

- 指摘本文は引用（`>`）にして、メタ情報と分ける
- JSで生成された要素は「HTMLソースに記述なし（JSで生成された要素の可能性）」と書く
- 状態の行は該当する時だけ出す（「出力時は非表示」「出力時に要素が見つからない」）
- 出力時に要素が見つかれば、セレクタなどを現在のDOMから取り直す。見つからなければ記録時の情報を使う

---

## 6. データモデルと正本

### 正本

- **IndexedDB `ui-review-tool` → ストア `kv` → キー `state` が唯一の正本だ。**
- 出力するMarkdownは派生物にすぎない。読み込み直す機能はない。

### 保存する形

```js
{
  v: 1,
  source: { kind: 'dir'|'file'|'files', name: string, handle: FileSystemHandle|null },
  htmlPath: 'index.html',          // フォルダ内の相対パス
  nextId: 5,                       // 次に振る番号（減らすのは空の指摘を破棄した時だけ）
  annotations: [{
    id: 1, comment: '...',
    snap: { selector, tag, label, text, html, line, crumb }   // 記録時の要素情報
  }]
}
```

### 実行時だけ持つフィールド（保存しない）

- `el`: 結び付いたDOM要素
- `vis`: `'pending'|'ok'|'hidden'|'missing'`
- `li` / `mk`: 右リストの行とマーカーのDOM

### 読み込み元（source.kind）

| kind | 取得経路 | 次回起動時 |
|---|---|---|
| `dir` | `showDirectoryPicker()`、またはフォルダのドロップ（`getAsFileSystemHandle`） | 参照を復元する。許可済みなら自動で開き、未許可なら「前回の…を開く」ボタンを出す |
| `file` | `showOpenFilePicker()`、HTMLのドロップ、`<input type=file>` | Handleで開いた場合だけ復元できる |
| `files` | `<input webkitdirectory>`、または`webkitGetAsEntry`（API非対応時の代替経路） | 復元できない。同じ名前のフォルダを開き直すと、そのまま再開する |

### 同一対象の判定（isSameRoot）

- 両方にHandleがあれば`isSameEntry()`で判定する
- それ以外は、種別（フォルダ／ファイル）と名前で判定する
- 同一対象かつ同じHTMLなら指摘を維持する。それ以外は確認を出して削除し、`nextId`を1に戻す

### 要素の再結合（resolveAnn）

1. セレクタで検索し、タグ名が一致するか確認する
2. テキストが記録時と異なる場合は、「同じタグかつ同じテキスト」の要素が唯一あればそちらを採用する
3. 見つからなければ「要素なし」とし、15フレームごとに再検索する（JSで後から描画される要素に対応するため）

### セレクタ生成の優先順位（uniqueSelector）

1. 一意な`#id`
2. `data-testid`、`data-test`、`data-cy`、`data-qa`、`data-id`、`name`、`aria-label`
3. `tag.class`（状態系やハッシュ系のクラスは除外し、最大2個）を祖先方向に積み上げる。一意な祖先idがあればそこで止め、必要な箇所だけ`:nth-of-type`を付ける

---

## 7. 検証結果

### 自動検証済み（Playwright＋Chromium、ヘッドレス）

- **file://で開いた場合（43項目）**: フォルダの取り込み（node_modulesは除外）、CSSの`@import`と`url()`、style属性、JSの実行、fetchでのJSON読み込み、JSで追加したimgの相対src、Qの切替（iframeにフォーカスがある時も含む）、選択中のクリックがアプリに届かないこと、空の指摘の破棄と番号の再利用、削除しても番号を振り直さないこと、モーダル内の要素が「非表示」になること、ホイールの転送、リストからのジャンプ、相対リンクでの遷移の阻止、出力内容（セレクタが一意であること、行番号12行目と24行目が正しいこと、改行を含む指摘）、クリップボードへのコピー、ツール再起動後の復元、同じフォルダを開き直した時に確認が出ないこと、別フォルダの確認（キャンセルで維持・OKで削除）、欠落ファイルの警告、リセット
- **http://localhostで開いた場合（6項目）**: FileSystemDirectoryHandleでの取り込み、IndexedDBへのHandle保存、ファイル変更後の「再読込」での反映、ツール再起動後の自動再開。Handleの代わりにOPFSで作った疑似フォルダを使った

### 未検証事項（実機のChromeで要確認）

1. `showDirectoryPicker()`と`showOpenFilePicker()`のネイティブダイアログが、file://で開いたツールから正常に開くか
2. OSのエクスプローラー／FinderからドラッグしたフォルダのHandleが取得できるか（`getAsFileSystemHandle`）
3. file://上でFileSystemHandleをIndexedDBに保存できるか。また、次回起動時の`requestPermission()`のプロンプトがどう出るか（「毎回許可」を選べるか）

失敗時の挙動:
- 1が例外になった場合は、もう一度押すと`<input webkitdirectory>`に切り替わる
- 3の保存に失敗した場合は、Handleを捨てて指摘だけを保存し、通知を出す

---

## 8. 既知の制約（Phase1の範囲外）

- ESモジュールの相対import（`import './x.js'`）: 動かない。検出したら警告を出す
- XMLHttpRequestの相対パス: 書き換えていない（fetchのみ対応）
- 他のHTMLへのページ遷移とフォーム送信: 阻止して通知を出す。別のHTMLは「フォルダを開く」から選ぶ
- `document.currentScript.src`を基準に隣のファイルを読むライブラリ（ace、monaco等）: blob URLになるため動かない
- history APIでルーティングするSPA: srcdocの制約で`pushState`が失敗する可能性がある（未検証）
- JSで動的に挿入した、相対パスの`<script src>`: 読み込めない（画像・動画・音声・linkは対応済み）
- 行番号: 推定値だ。テーブルのfoster parentingや、書式タグの再構築で前後にずれることがある
- 対象アプリのDOMには`data-uir-l`属性と、`<script data-uir-shim>`を1つ注入している
- 対象アプリのlocalStorageは、ツールと同じオリジン（file://）を共有する
- コンソールに`ERR_FILE_NOT_FOUND`が出ることがある。JSで追加した画像がblob URLに置き換わる前に読み込みを試みるためで、実害はない

---

## 9. Phase2候補（未着手）

| 優先 | 内容 | 理由 |
|---|---|---|
| 高 | `↑`/`↓`で親要素／子要素へ選択を移動する | 小さい要素とコンテナの選び分けが難しいためだ。DevToolsにもある操作だ |
| 中 | ESモジュールの相対importを再帰的に書き換える | Vite等を使わない素のESM構成に対応するためだ |
| 中 | 指摘ごとにスクリーンショットを添付する | 見た目に関する指摘をAIに伝える精度を上げるためだ |
| 低 | 表示幅の切替（例: 375 / 768 / 1280） | PC限定の要件のため、優先度は低い |
| 低 | XHRへの対応 | 古いコードへの対応 |

---

## 10. コードマップ（`ui-review-tool.html`内の`<script>`）

| 行 | セクション | 主な関数 |
|---|---|---|
| 211 | 定数・状態 | `state`, `VFS`, `LINE_ATTR`, `TOOL_DIR`, `SKIP_DIRS`, `MIME` |
| 245 | 汎用 | `toast`, `warn`, `isEditable` |
| 284 | 保存（IndexedDB） | `persist`（300msの遅延保存）, `saveNow` |
| 329 | 仮想フォルダ | `localRef`, `vfsFile`, `listHtml`, `blobFor`, `rewriteCss`, `rewriteSrcset` |
| 433 | 行番号の推定 | `scanStartTags`, `markLines` |
| 468 | iframe用HTMLの組み立て | `SHIM`, `window.__UIR`（SHIMとのブリッジ）, `buildHtml` |
| 558 | 読み込みフロー | `openSource`, `isSameRoot`, `chooseHtml`, `render`, iframeの`load`処理, `onFrameClick` |
| 669 | ピッカー・ドロップ | `pickDir`, `pickFile`, `handleDrop`, `readEntryDir` |
| 763 | 要素の記述 | `uniqueSelector`, `textOf`, `htmlSnippet`, `breadcrumb`, `describe`, `resolveAnn` |
| 847 | 指摘の操作 | `createAnn`, `removeAnn`, `clearAnnotations`, `activate`, `jumpTo` |
| 893 | 右リスト | `renderList`, `makeItem`, イベント委譲（click/focusin/input/keydown/focusout） |
| 953 | 選択モード | `setMode`, `onKey`, `hoverAt`, glassのイベント（ホイール転送を含む） |
| 1003 | 描画ループ | `loop`, `drawMarker`, `placeOf`, `drawHover` |
| 1059 | 出力 | `buildExport`, `copyText` |
| 1117 | ボタン類 | `updateWarn`, `updateUI` |
| 1157 | 起動時の復元 | `showResume`, `init` |

- デバッグ用に`window.__uir = { state, openSource }`を公開している

---

## 11. 開発・テスト時の注意（ハマりどころ）

- **Playwrightの`page.evaluate()`はPromiseの完了を待つ。** `openSource()`はHTML選択ダイアログの操作を待つため、そのままevaluateで呼ぶとデッドロックする。`()=>{ openSource(...); }`のように戻り値を捨てて呼ぶ
- **OPFSはfile://では使えない（SecurityError）。** Handle系のテストはhttp://localhostで行う
- **この開発環境では、Chromiumに`--no-proxy-server`を付けないとlocalhostに接続できなかった**（環境変数のプロキシ設定を拾うため）
- **`<input webkitdirectory>`に同じフォルダを続けて設定するとchangeイベントが出ない。** 本体の`pickDir()`は毎回`value=''`でリセットしている。テストでも同じリセットが必要だ
- **「再読込」の直後は、古いiframeがまだ残っている。** テストでは旧windowに印を付け、新しいwindowに切り替わるのを待ってから検査する
- 検証時はChromiumのフルビルドを使った（`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`）。テスト用のサンプルアプリは、CSSの@import、CSSのurl()、style属性、fetchでのJSON読み込み、JS生成の要素とimg、モーダル、相対リンクを含む構成だ

---

## 12. 次の一手

1. 実機のChromeでツールを開き、セクション7の未検証事項1〜3を確認する
2. 実際の自作アプリで1サイクル回す（指摘→出力→AIで修正→再読込→確認）。出力フォーマットでAIが要素を取り違えないかを見る
3. 取り違えや使いにくさがあれば、Phase2の「↑/↓で親子移動」から着手する
