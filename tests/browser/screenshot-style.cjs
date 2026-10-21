// Synthetic-fixture PC Chrome regression for arrow tips and editable size menus.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const before = process.argv.includes('--before');
  const output = path.resolve('test-results/arrow-style');
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 }, deviceScaleFactor: 1, acceptDownloads: true });
  const errors = [], checks = [], cases = [];
  page.on('pageerror', error => errors.push(String(error)));
  const pass = message => { checks.push(message); console.log('PASS ' + message); };
  const target = before ? 'test-results/arrow-style/before.html' : 'apps/screenshot-annotator/index.html';
  const fixture = async () => {
    await page.goto('file://' + path.resolve(target));
    const png = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 700; c.height = 400;
      const context = c.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, 700, 400);
      return c.toDataURL().split(',')[1];
    });
    await page.locator('#fileInput').setInputFiles({ name: 'white.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.waitForFunction(() => baseImage && canvas.width === 700);
  };
  const point = async (x, y) => {
    const box = await page.locator('#canvas').boundingBox();
    return { x: box.x + x * box.width / 700, y: box.y + y * box.height / 400 };
  };
  const drag = async (type, x, y, w, h) => {
    await page.locator('[data-tool="' + type + '"]').click();
    const a = await point(x, y), b = await point(x + w, y + h);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up();
  };
  const selectFirst = async (x, y) => {
    await page.locator('[data-tool="select"]').click(); const p = await point(x, y); await page.mouse.click(p.x, p.y);
    assert.equal(await page.evaluate(() => selectedIndex), 0);
  };
  const arrowCases = [
    { name: 'horizontal', x: 90, y: 140, w: 360, h: 0, lineWidth: 4, arrowSize: 28 },
    { name: 'diagonal', x: 100, y: 320, w: 350, h: -200, lineWidth: 10, arrowSize: 30 },
    { name: 'reverse', x: 570, y: 100, w: -350, h: 160, lineWidth: 14, arrowSize: 36 },
    { name: 'vertical', x: 200, y: 300, w: 0, h: -200, lineWidth: 9, arrowSize: 28 },
    { name: 'thick-small-head', x: 80, y: 180, w: 400, h: 0, lineWidth: 40, arrowSize: 8 },
    { name: 'short', x: 200, y: 200, w: 7, h: 0, lineWidth: 18, arrowSize: 100 },
    { name: 'short-diagonal', x: 220, y: 220, w: -7, h: -5, lineWidth: 40, arrowSize: 8 },
    { name: 'dashed', x: 90, y: 300, w: 430, h: -180, lineWidth: 12, arrowSize: 28, lineStyle: 'dashed' },
    { name: 'dotted', x: 90, y: 160, w: 400, h: 0, lineWidth: 8, arrowSize: 28, lineStyle: 'dotted' },
  ];
  try {
    await fixture();
    for (const scenario of arrowCases) {
      const item = { type: 'arrow', color: '#ff0000', fillMode: 'none', lineStyle: 'solid', arrowHead: 'triangle', fontSize: 30, ...scenario };
      const result = await page.evaluate(item => {
        annotations = [item]; selectedIndex = null; render(false);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const length = Math.hypot(item.w, item.h), ux = item.w / length, uy = item.h / length;
        const tipX = item.x + item.w, tipY = item.y + item.h;
        let pastTipPixels = 0, maxTipExtension = -Infinity, redPixels = 0;
        for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
          const p = (y * canvas.width + x) * 4;
          if (pixels[p] > 180 && pixels[p + 1] < 150 && pixels[p + 2] < 150) {
            redPixels++;
            const along = (x + .5 - tipX) * ux + (y + .5 - tipY) * uy;
            maxTipExtension = Math.max(maxTipExtension, along);
            if (along > 1) pastTipPixels++;
          }
        }
        return { name: item.name, redPixels, pastTipPixels, maxTipExtension };
      }, item);
      cases.push(result); console.log(JSON.stringify(result));
      await page.locator('#canvas').screenshot({ path: path.join(output, (before ? 'before-' : 'after-') + scenario.name + '.png') });
      assert.ok(result.redPixels > 10);
      if (!before) assert.equal(result.pastTipPixels, 0, scenario.name + ' no shaft past triangle tip');
    }
    if (before) {
      assert.ok(cases.some(item => item.pastTipPixels > 0), 'before reproduces shaft past arrow tip');
      pass('修正前の先端からはみ出す線を再現');
      return;
    }
    pass('9種の矢印で先端を超える赤色ピクセルなし');

    for (const control of [
      { id: 'lineWidth', type: 'arrow', property: 'lineWidth', direct: 7.5, toggle: '線の太さの候補', invalid: 41 },
      { id: 'arrowSize', type: 'arrow', property: 'arrowSize', direct: 37, toggle: '矢印の大きさの候補', invalid: 121 },
      { id: 'fontSize', type: 'text', property: 'fontSize', direct: 37, toggle: 'サイズの候補', invalid: 121 },
      { id: 'blurStrength', type: 'blur', property: 'blurStrength', direct: 17, toggle: 'ぼかしの粗さの候補', invalid: 41 },
    ]) {
      await fixture();
      if (control.type === 'text') {
        await page.locator('[data-tool="text"]').click(); const p = await point(120, 140); await page.mouse.click(p.x, p.y);
        await page.locator('#inlineTextEditor').fill('サイズを選択 ABC'); await page.locator('#inlineTextEditor').press('Enter');
        await selectFirst(125, 150);
      } else {
        await drag(control.type, 120, 140, 220, 80); await selectFirst(180, control.type === 'arrow' ? 162 : 175);
      }
      const input = page.locator('#' + control.id), menu = page.locator('#' + control.id + 'Options');
      assert.equal(await input.getAttribute('role'), 'combobox');
      await page.getByRole('button', { name: control.toggle, exact: true }).click();
      assert.equal(await input.getAttribute('aria-expanded'), 'true'); await menu.waitFor({ state: 'visible' });
      const option = menu.getByRole('option').nth(2), candidate = parseFloat(await option.textContent());
      assert.ok(Number.isFinite(candidate)); await option.click();
      assert.equal(Number(await input.inputValue()), candidate);
      assert.equal(await page.evaluate(property => annotations[0][property], control.property), candidate);
      assert.equal(await input.getAttribute('aria-expanded'), 'false');
      await input.fill(String(control.direct));
      assert.equal(await page.evaluate(property => annotations[0][property], control.property), control.direct);
      const beforeEmpty = await page.evaluate(() => JSON.stringify(annotations[0]));
      await input.fill(''); assert.equal(await page.evaluate(() => JSON.stringify(annotations[0])), beforeEmpty);
      await input.press('Tab'); assert.equal(Number(await input.inputValue()), control.direct);
      await input.fill(String(control.invalid)); assert.equal(await page.evaluate(() => JSON.stringify(annotations[0])), beforeEmpty);
      await input.press('Tab'); assert.equal(Number(await input.inputValue()), control.direct);
      await input.fill('0'); assert.equal(await page.evaluate(() => JSON.stringify(annotations[0])), beforeEmpty);
      await input.press('Tab'); assert.equal(Number(await input.inputValue()), control.direct);
      await input.focus(); await input.press('ArrowDown');
      assert.equal(await input.getAttribute('aria-expanded'), 'true');
      await input.press('ArrowDown'); await input.press('Enter');
      const keyboardValue = Number(await input.inputValue());
      assert.equal(await page.evaluate(property => annotations[0][property], control.property), keyboardValue);
      assert.equal(await input.getAttribute('aria-expanded'), 'false');
      await input.press('ArrowDown'); await input.press('Escape');
      assert.equal(await input.getAttribute('aria-expanded'), 'false');
      assert.equal(Number(await input.inputValue()), keyboardValue);
      await input.press('ArrowDown'); await input.press('Tab');
      assert.equal(await input.getAttribute('aria-expanded'), 'false');
      pass(control.id + ': 候補クリック/直接入力/選択注釈へ即時反映、空欄・範囲外保護、キー操作');
    }
    await fixture(); await page.locator('[data-tool="text"]').click();
    const textPoint = await point(95, 95); await page.mouse.click(textPoint.x, textPoint.y);
    await page.locator('#inlineTextEditor').fill('入力中サイズ ABC\n位置を維持');
    await page.getByRole('button', { name: 'サイズの候補', exact: true }).click();
    const draftOption = page.locator('#fontSizeOptions').getByRole('option').nth(4);
    const draftSize = parseFloat(await draftOption.textContent()); await draftOption.click();
    assert.equal(await page.evaluate(() => editingText.style.fontSize), draftSize);
    assert.equal(await page.locator('#inlineTextEditor').inputValue(), '入力中サイズ ABC\n位置を維持');
    await page.locator('#fontSize').fill('44');
    assert.equal(await page.evaluate(() => editingText.style.fontSize), 44);
    const draftImage = await page.evaluate(() => canvas.toDataURL());
    await page.locator('#inlineTextEditor').press('Enter');
    assert.equal(await page.evaluate(() => canvas.toDataURL()), draftImage);
    assert.equal(await page.evaluate(() => annotations[0].fontSize), 44);
    pass('文字入力中も候補/直接入力で文字サイズを変更し、確定前後のCanvasピクセル一致');

    await fixture();
    await drag('arrow', 100, 270, 360, -120); await selectFirst(220, 230);
    const images = [];
    for (const shape of ['triangle', 'open', 'none']) {
      await page.locator('#arrowHead').selectOption(shape);
      assert.equal(await page.evaluate(() => annotations[0].arrowHead), shape);
      const image = await page.evaluate(() => { render(false); return canvas.toDataURL(); }); images.push(image);
      await page.locator('#canvas').screenshot({ path: path.join(output, 'after-shape-' + shape + '.png') });
    }
    assert.equal(new Set(images).size, 3); pass('三角/線のみ/なしを選択し既存矢印の形状へ反映');
    await page.locator('#arrowHead').selectOption('triangle');
    await page.locator('#lineWidth').fill('18'); await page.locator('#arrowSize').fill('28');
    const expected = await page.evaluate(() => { render(false); return canvas.toDataURL().split(',')[1]; });
    const downloadEvent = page.waitForEvent('download'); await page.locator('#saveBtn2').click();
    const download = await downloadEvent; const exportedPath = path.join(output, 'export.png'); await download.saveAs(exportedPath);
    const exported = fs.readFileSync(exportedPath);
    assert.equal(exported.readUInt32BE(16), 700); assert.equal(exported.readUInt32BE(20), 400);
    assert.deepEqual(exported, Buffer.from(expected, 'base64')); pass('PNG出力は700×400、選択枠を含まない修正後のCanvas描画と一致');
    await page.getByRole('button', { name: '線の太さの候補', exact: true }).click();
    await page.screenshot({ path: path.join(output, 'after-desktop-expanded.png'), fullPage: true });
    assert.deepEqual(errors, []); pass('ブラウザ実行エラーなし');
  } finally {
    fs.writeFileSync(path.join(output, before ? 'before-results.json' : 'results.json'), JSON.stringify({ browser: await browser.version(), target, checks, cases, errors,
      limitations: ['実OSクリップボード・IME・ダイアログは対象外。合成画像だけを使用。'] }, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
