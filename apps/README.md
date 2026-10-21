# アプリの追加方法

機能ごとに`apps/<id>/index.html`を置く。IDは英小文字・数字・ハイフンで指定する。
ひな形は`templates/html-app/`。アプリからホームへのリンクは`../../index.html`。

`apps/registry.js`の配列へ、以下の形式で追加する。

```js
{
  id: 'my-tool',
  name: 'アプリ名',
  description: 'このアプリでできること',
  category: '作業支援',
  tags: ['HTML', '作業']
}
```

登録先は必ず`apps/<id>/index.html`。任意の外部URLは登録しない。
カードのタイトル・説明・タグは文字列として描画する。IDは重複させない。
CSS・JSを分ける場合はアプリ内の`assets/`、仕様・引き継ぎ・検証などの資料はルートからの`docs/<機能名>/`へ置く。
単一HTML要件のあるアプリはCSS・JSをHTMLに埋め込む。
保存キーはアプリIDで分ける。別アプリの内部ファイルに依存しない。

登録後は`node scripts/check-workspace.cjs`、ホームの検索、カードからの起動、ホームへの復帰を確認する。
