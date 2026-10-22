/* 表示一覧の正本。idはapps/<id>/index.htmlと一致させる。 */
globalThis.WEB_APPS = [
  {
    id: 'ui-review-tool',
    name: 'UI指摘ツール',
    description: '画面の気になるところを選んで指摘。AIに渡せる修正指示をMarkdownにまとめます。',
    category: '開発支援',
    tags: ['UIレビュー', 'HTML', 'AI連携']
  },
  {
    id: 'screenshot-annotator',
    name: 'スクショ注釈ツール',
    description: 'スクリーンショットに枠・矢印・文字を追加。伝えたいところを、画像に書き込めます。',
    category: '画像ツール',
    tags: ['スクショ', '注釈', 'PNG出力']
  },
  {
    id: 'png-to-gif',
    name: 'PNG・MP4からGIF作成',
    description: 'PNGを並べたり、MP4の時間・画面を切り取ってGIFに変換。作成前に容量の見込みを確認できます。',
    category: '画像ツール',
    tags: ['GIF', 'PNG', 'MP4', '動画切り取り']
  }
];
