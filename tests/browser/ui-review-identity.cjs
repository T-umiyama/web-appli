// Synthetic dynamic DOM fixtures; no user data or network is used.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const before = process.argv.includes('--before');
const output = path.resolve('test-results/ui-review-identity');
fs.mkdirSync(output, { recursive: true });
const fixture = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>button{padding:12px;margin:10px}section{padding:20px}</style></head><body><header><button id="open-json" aria-label="正本JSONを開く">開く</button></header><main><section class="empty-state"><div class="panel-body"><div class="toolbar"><button class="button button-primary" data-action="new-project">案件を作成</button><button class="button button-secondary" data-action="open-json">正本JSONを開く</button></div></div></section></main></body></html>';
fs.writeFileSync(path.join(output, 'fixture.html'), fixture);
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
 const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
 const errors = [], checks = [];
 page.on('pageerror', error => errors.push(String(error)));
 const target = before ? path.join(output, 'before.html') : path.resolve('apps/ui-review-tool/index.html');
 const pass = message => { checks.push(message); console.log('PASS ' + message); };
 const app = () => page.frames().find(frame => frame.parentFrame());
 const fresh = async (html = fixture) => {
  await page.goto('file://' + target);
  await page.waitForFunction(() => !!window.__uir);
  await page.waitForTimeout(50);
  await page.evaluate(() => { __uir.state.annotations = []; __uir.state.nextId = 1; __uir.state.source = null; });
  await page.locator('#fileInput').setInputFiles({ name: 'identity-fixture.html', mimeType: 'text/html', buffer: Buffer.from(html) });
  await page.waitForFunction(() => !document.querySelector('#selectMode').disabled);
 };
 const select = async selector => {
  if (await page.locator('#selectMode').getAttribute('aria-pressed') !== 'true') await page.locator('#selectMode').click();
  const box = await app().locator(selector).boundingBox(); assert.ok(box);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.locator('.annotation.active textarea').fill('保存ファイルを開くにして');
  await page.locator('.annotation.active textarea').press('Enter');
 };
 const read = () => page.evaluate(() => { const md = __uir.buildExport(), a = __uir.state.annotations[0]; return { md, vis: a.vis, current: a.el?.outerHTML || null, snap: a.snap }; });
 try {
  await fresh(); await select('[data-action="open-json"]');
  const initial = await read();
  // Reproduce historical v1 snapshots, before data-action selector support.
  await page.evaluate(() => { const a = __uir.state.annotations[0]; a.snap = { ...a.snap, selector: 'div.toolbar > button.button.button-secondary:nth-of-type(2)' }; delete a.snap.identity; });
  await app().evaluate(() => document.querySelector('.toolbar').innerHTML = '<button class="button button-primary" data-action="new-other">別画面</button><button class="button button-secondary" data-action="delete-project">案件を削除</button>');
  const removed = await read();
  fs.writeFileSync(path.join(output, before ? 'before.md' : 'after-missing.md'), removed.md);
  await page.screenshot({ path: path.join(output, before ? 'before.png' : 'after-missing.png') });
  if (before) { assert.match(removed.current, /delete-project/); assert.match(removed.md, /案件を削除/); pass('旧nth位置へ別操作を置くと指摘と出力が削除ボタンへすり替わる不具合を再現'); return; }
  assert.equal(removed.current, null); assert.equal(removed.vis, 'missing'); assert.match(removed.md, /正本JSONを開く/); assert.match(removed.md, /data-action="open-json"/); assert.doesNotMatch(removed.md, /delete-project/); pass('旧v1 snapshotの順序セレクタ再利用でも別ボタンに再結合せず、記録時情報を維持');
  await page.evaluate(() => __uir.saveNow()); await page.reload(); await page.waitForFunction(() => __uir?.state.annotations.length === 1);
  assert.equal((await read()).snap.identity, undefined);
  await page.locator('#fileInput').setInputFiles({ name: 'identity-fixture.html', mimeType: 'text/html', buffer: Buffer.from(fixture) });
  await page.waitForFunction(() => !document.querySelector('#selectMode').disabled);
  assert.match((await read()).current, /data-action="open-json"/); assert.doesNotMatch((await read()).current, /id="open-json"/); pass('identity字段のない既存v1保存済み指摘を再開し、ヘッダ固定IDと中央data-actionを区別');

  await fresh(); await select('[data-action="open-json"]');
  assert.match((await read()).snap.selector, /data-action/);
  await app().evaluate(() => { const n = document.querySelector('[data-action="open-json"]'); const p = n.parentElement; n.remove(); p.insertAdjacentHTML('afterbegin', '<button class="button button-secondary" data-action="open-json">保存ファイルを開く</button>'); });
  const renamed = await read(); assert.match(renamed.current, /保存ファイルを開く/); assert.equal(renamed.vis, 'ok'); assert.match(renamed.md, /正本JSONを開く/); assert.match(renamed.md, /確認時の文字:.*保存ファイルを開く/); pass('data-actionで並替・再生成・文言変更後も同一操作に結合し記録時と確認時の文言を区別');
  await page.evaluate(() => __uir.saveNow()); await page.reload(); await page.waitForFunction(() => __uir?.state.annotations.length === 1);
  assert.match((await read()).snap.html, /正本JSONを開く/); assert.equal((await read()).vis, 'pending');
  await page.locator('#fileInput').setInputFiles({ name: 'identity-fixture.html', mimeType: 'text/html', buffer: Buffer.from(fixture) });
  await page.waitForFunction(() => !document.querySelector('#selectMode').disabled);
  assert.equal((await read()).vis, 'ok'); pass('IndexedDB v1へ保存・再開し記録時snapshotを保持したまま同じ対象へ復帰');

  await fresh(); await select('#open-json');
  await app().evaluate(() => document.querySelector('#open-json').outerHTML = '<button id="open-json" aria-label="保存ファイルを開く">保存を開く</button>');
  assert.match((await read()).current, /保存を開く/); pass('固定IDのボタンはラベル変更後も同一要素と認識');

  const drawings = '<!doctype html><body><header><div class="file-actions" aria-label="図面JSONの操作" style="padding:30px"><span>図面なし</span><button>開く</button></div></header></body>';
  await fresh(drawings); await select('[aria-label="図面JSONの操作"]');
  // Use the container itself, as in the reported #3 (clicking child button is a different target).
  await page.evaluate(() => { const a = __uir.state.annotations[0], n = document.querySelector('#frame').contentDocument.querySelector('[aria-label="図面JSONの操作"]'); a.snap = { selector: 'div[aria-label="図面JSONの操作"]', tag: 'div', label: 'div.file-actions', text: n.textContent, html: n.outerHTML, crumb: 'html > body > header > div.file-actions', line: null }; a.el = n; });
  await app().evaluate(() => { document.querySelector('[aria-label="図面JSONの操作"]').innerHTML = '<span>図面を読込済み</span><button>開く</button><button>保存</button>'; });
  assert.equal((await read()).vis, 'ok'); assert.match((await read()).current, /図面を読込済み/); assert.match((await read()).md, /図面なし/); pass('旧v1のaria-labelだけを持つ動的コンテナも、内容変更後に文脈と一意性で確認');

  await fresh(); await select('[data-action="open-json"]');
  await app().evaluate(() => document.querySelector('main').innerHTML = '<section class="other-screen"><div class="panel-body"><div class="toolbar"><button data-action="open-json">正本JSONを開く</button></div></div></section>');
  assert.equal((await read()).current, null); pass('別画面で同じdata-action・同じ文言を再利用しても元画面の指摘と混同しない');

  await fresh(); await select('[data-action="open-json"]');
  await app().evaluate(() => { const n = document.querySelector('[data-action="open-json"]'); n.after(n.cloneNode(true)); });
  assert.equal((await read()).vis, 'ambiguous'); assert.equal((await read()).current, null); assert.match((await read()).md, /候補が複数/); pass('同一の候補が複数ある場合は曖昧としてマークせず、順序だけで決めない');
  await app().evaluate(() => { const nodes = document.querySelectorAll('[data-action="open-json"]'); nodes[1].remove(); nodes[0].hidden = true; });
  assert.equal((await read()).vis, 'hidden'); pass('一意候補が非表示なら非表示状態として記録');

  const rows = '<!doctype html><body><main><section class="rows"><div data-id="room-a"><button data-action="edit">編集</button></div><div data-id="room-b"><button data-action="edit">編集</button></div></section></main></body>';
  await fresh(rows); await select('[data-id="room-a"] button');
  await app().evaluate(() => { const a = document.querySelector('[data-id="room-a"]'); a.outerHTML = '<div data-id="room-a"><button data-action="edit">室を編集</button></div>'; document.querySelector('.rows').prepend(document.querySelector('[data-id="room-b"]')); });
  assert.match((await read()).current, /室を編集/); pass('同名・同じdata-actionの複数行は祖先data-idで識別し、並替後も正しい行へ結合');
  await app().evaluate(() => document.querySelector('[data-id="room-a"]').remove());
  assert.equal((await read()).current, null); pass('元の行消失後は他の行の同名ボタンへ移さない');

  const panels = '<!doctype html><body><main><section class="panel"><div class="panel-body" style="padding:30px"><table><caption>空調リスト</caption></table></div></section><section class="panel"><div class="panel-body" style="padding:30px"><table><caption>換気リスト</caption></table></div></section></main></body>';
  await fresh(panels); await select('.panel-body >> text=空調リスト');
  await page.evaluate(() => { const a = __uir.state.annotations[0], n = document.querySelector('#frame').contentDocument.querySelector('.panel-body'); a.snap = { selector: 'section.panel:nth-of-type(1) > div.panel-body', tag: 'div', label: 'div.panel-body', text: n.textContent, html: n.outerHTML, crumb: 'body > main > section.panel > div.panel-body', line: null }; a.el = n; });
  await app().evaluate(() => document.querySelector('main').innerHTML = '<section class="panel"><div class="panel-body"><table><caption>照明リスト</caption></table></div></section><section class="panel"><div class="panel-body"><table><caption>換気リスト</caption></table></div></section>');
  assert.equal((await read()).current, null); assert.match((await read()).md, /空調リスト/); pass('順序だけで識別したリストが別リストへ変わっても元のHTML抜粋を保持');
  assert.deepEqual(errors, []); pass('ブラウザ実行エラーなし');
 } finally {
  fs.writeFileSync(path.join(output, before ? 'before-results.json' : 'identity-results.json'), JSON.stringify({ browser: await browser.version(), target, checks, errors }, null, 2));
  await browser.close();
 }
})().catch(error => { console.error(error); process.exit(1); });
