'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateApps, filterApps } = require('../assets/catalog.js');
const { checkWorkspace } = require('../scripts/check-workspace.cjs');
const entry = changes => ({ id: 'ui-review-tool', name: 'UI指摘ツール', description: '画面から修正指示を作る', category: '開発支援', tags: ['HTML', 'AI連携'], ...changes });

test('registryは安全な機能IDからのみローカルのアプリURLを作る', () => {
  assert.equal(validateApps([entry({ href: 'https://example.com/' })])[0].href, 'apps/ui-review-tool/index.html');
  for (const id of ['../outside', 'a/b', '%2e%2e', 'a\\b', '/absolute', 'a?x', 'a#x', 'two--hyphens', 'UPPER', '']) {
    assert.throws(() => validateApps([entry({ id })]), /ID/);
  }
});

test('ID重複と不完全な登録を拒否し、表示用の余白を取り除く', () => {
  assert.throws(() => validateApps([entry(), entry()]), /重複/);
  assert.throws(() => validateApps({}), /配列/);
  for (const changes of [{ name: ' ' }, { description: null }, { category: '' }, { tags: 'HTML' }, { tags: [null] }]) {
    assert.throws(() => validateApps([entry(changes)]));
  }
  const result = validateApps([entry({ name: ' 道具 ', tags: [' HTML '] })])[0];
  assert.equal(result.name, '道具');
  assert.deepEqual(result.tags, ['HTML']);
});

test('検索は日本語、全半角英数、大小文字、半角カナを正規化して複数語をAND検索する', () => {
  const apps = validateApps([
    entry({ tags: ['ＨＴＭＬ', 'スクリーンショット'] }),
    entry({ id: 'text-tool', name: 'テキスト整理', description: '文字をまとめる', category: '文章', tags: ['text'] })
  ]);
  assert.deepEqual(filterApps(apps, ' ｈｔｍｌ　指摘 ', '').map(app => app.id), ['ui-review-tool']);
  assert.equal(filterApps(apps, 'ｽｸﾘｰﾝｼｮｯﾄ', '').length, 1);
  assert.equal(filterApps(apps, '開発支援 修正', '開発支援').length, 1);
  assert.equal(filterApps(apps, 'HTML', '文章').length, 0);
  assert.equal(filterApps(apps, 'HTML 未登録の語', '').length, 0);
  assert.equal(filterApps(apps, '　 ', '').length, 2);
});

function workspaceFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'web-appli-check-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'assets'));
  fs.mkdirSync(path.join(root, 'apps'));
  fs.copyFileSync(path.join(__dirname, '../assets/catalog.js'), path.join(root, 'assets/catalog.js'));
  fs.writeFileSync(path.join(root, 'apps/registry.js'), 'globalThis.WEB_APPS = [];');
  return root;
}

test('全体チェックは全inline scriptを調べ、script/style本文とエスケープ済みの例をリンク扱いしない', t => {
  const root = workspaceFixture(t);
  fs.writeFileSync(path.join(root, 'file name.html'), '<p>参照先</p>');
  fs.writeFileSync(path.join(root, 'index.html'), [
    '<!-- <a href="missing-comment.html"> -->',
    '<a href="file%20name.html?x=1&amp;y=2#section">有効なリンク</a>',
    '<code>&lt;a href="missing-example.html"&gt;</code>',
    '<script>const example = \'<a href="missing-string.html">\';</script>',
    '<style>body::after { content: \'<a href="missing-css.html">\'; }</style>',
    '<script type="application/json">{"notJavascript":true}</script>',
    '<script>const secondScript = 2;</script>'
  ].join('\n'));
  const result = checkWorkspace(root);
  assert.deepEqual(result.errors, []);
  assert.equal(result.inlineCount, 2);
});

test('全体チェックは欠落リンク・閉じ忘れ・後続inline scriptとCJSの構文異常を検出する', t => {
  const root = workspaceFixture(t);
  fs.writeFileSync(path.join(root, 'index.html'), '<a href="missing.html">欠落</a><script>const valid = 1;</script><script>const invalid = ;</script>');
  fs.writeFileSync(path.join(root, 'unclosed.html'), '<script src="missing.js">');
  fs.writeFileSync(path.join(root, 'invalid.cjs'), 'const broken = ;');
  fs.writeFileSync(path.join(root, 'source.md'), '[原資料なので対象外](missing.md)');
  const result = checkWorkspace(root);
  assert.equal(result.inlineCount, 2);
  assert.equal(result.errors.length, 5);
  assert.ok(result.errors.some(error => error.includes('missing.html')));
  assert.ok(result.errors.some(error => error.includes('missing.js')));
  assert.ok(result.errors.some(error => error.includes('</script>')));
  assert.ok(result.errors.some(error => error.includes('index.html:script@')));
  assert.ok(result.errors.some(error => error.includes('invalid.cjs')));
});
