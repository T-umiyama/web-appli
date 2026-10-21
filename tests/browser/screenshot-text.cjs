// Run with PLAYWRIGHT_MODULE and CHROME_EXECUTABLE when Chrome/Playwright are not on PATH.
// Evidence uses a synthetic white PNG only; no user screenshot is read or uploaded.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const before = process.argv.includes('--before');
  const output = path.resolve('test-results/text-alignment');
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 }, deviceScaleFactor: 1, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const target = before ? 'test-results/text-alignment/before.html' : 'apps/screenshot-annotator/index.html';
  const cases = [];
  const checks = [];
  const pass = message => { checks.push(message); console.log('PASS ' + message); };
  const fixture = async () => {
    await page.goto('file://' + path.resolve(target));
    await page.addStyleTag({ content: '#inlineTextEditor { caret-color: transparent !important; } #inlineTextEditor::selection { background: transparent !important; }' });
    const png = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 700; c.height = 400;
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      return c.toDataURL().split(',')[1];
    });
    await page.locator('#fileInput').setInputFiles({ name: 'white-fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.waitForFunction(() => baseImage && canvas.width === 700);
    await page.locator('[data-tool="text"]').click();
    await page.locator('#strokeColor').fill('#000000');
    await page.locator('#fillMode').selectOption('none');
  };
  const clickAt = async (x, y) => {
    const box = await page.locator('#canvas').boundingBox();
    await page.mouse.click(box.x + x * box.width / 700, box.y + y * box.height / 400);
    await page.waitForFunction(() => document.activeElement === inlineTextEditor);
  };
  const capture = async name => {
    await page.locator('#inlineTextEditor').evaluate(editor => editor.setSelectionRange(editor.value.length, editor.value.length));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const clip = await page.locator('#canvas').boundingBox();
    const buffer = await page.screenshot({ clip, path: path.join(output, name + '.png') });
    return buffer.toString('base64');
  };
  const compare = async (a, b) => page.evaluate(async ([a, b]) => {
    const decode = async value => {
      const img = new Image(); img.src = 'data:image/png;base64,' + value; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      return { width: c.width, height: c.height, data: x.getImageData(0, 0, c.width, c.height).data };
    };
    const first = await decode(a), second = await decode(b);
    const bounds = image => {
      let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1, pixels = 0;
      for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
        const p = (y * image.width + x) * 4;
        if (image.data[p] < 150 && image.data[p + 1] < 150 && image.data[p + 2] < 150) {
          minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); pixels++;
        }
      }
      return { minX, minY, maxX, maxY, pixels };
    };
    let changedPixels = 0;
    for (let p = 0; p < first.data.length; p += 4) if ([0, 1, 2].some(c => Math.abs(first.data[p + c] - second.data[p + c]) > 8)) changedPixels++;
    return { before: bounds(first), after: bounds(second), changedPixels, width: first.width, height: first.height };
  }, [a, b]);
  const styles = () => page.locator('#inlineTextEditor').evaluate(el => {
    const s = getComputedStyle(el), box = el.getBoundingClientRect();
    return { background: s.backgroundColor, border: s.borderTopWidth, outline: s.outlineWidth, outlineStyle: s.outlineStyle, outlineColor: s.outlineColor, shadow: s.boxShadow, resize: s.resize,
      padding: s.padding, fontFamily: s.fontFamily, fontSize: s.fontSize, lineHeight: s.lineHeight,
      x: box.x, y: box.y, width: box.width, height: box.height, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
  });
  try {
    for (const scenario of [
      { name: 'normal', zoom: 1, size: 30, text: '日本語 ABC 123' },
      { name: 'half-small', zoom: 0.5, size: 8, text: '日本語 ABC 123\n二行目 xyz\n3行目' },
      { name: 'large-multiline', zoom: 1.25, size: 30, text: '日本語 ABC\n二行目 xyz\n3行目 123' },
      { name: 'fractional', zoom: 1.333, size: 19, text: 'クリック位置 ABC\n次の行 日本語' },
      { name: 'long-line', zoom: 1, size: 18, text: '長い文字列 ABC '.repeat(14).trimEnd() },
    ]) {
      await fixture();
      await page.locator('#fontSize').fill(String(scenario.size));
      await page.evaluate(z => setZoom(z), scenario.zoom);
      await clickAt(73.4, 82.6);
      await page.locator('#inlineTextEditor').fill(scenario.text);
      const style = await styles();
      const canvasBox = await page.locator('#canvas').boundingBox();
      const prefix = (before ? 'before-' : 'after-') + scenario.name;
      const editing = await capture(prefix + '-editing');
      await page.locator('#inlineTextEditor').press('Enter');
      assert.equal(await page.evaluate(() => annotations.at(-1).text), scenario.text);
      const committed = await capture(prefix + '-committed');
      const pixel = await compare(editing, committed);
      const location = await page.evaluate(() => ({ x: annotations[0].x, y: annotations[0].y }));
      const record = { scenario, style, location, pixel };
      cases.push(record);
      console.log(JSON.stringify(record));
      if (!before) {
        assert.equal(style.background, 'rgba(0, 0, 0, 0)', scenario.name + ' editor is transparent');
        assert.equal(style.border, '0px'); assert.equal(style.outlineStyle, 'none'); assert.equal(style.shadow, 'none'); assert.equal(style.resize, 'none');
        assert.ok(Math.abs(location.x - 73.4) < 0.02 && Math.abs(location.y - 82.6) < 0.02, scenario.name + ' clicked anchor in image coordinates');
        assert.ok(Math.abs(style.x - canvasBox.x - location.x * canvasBox.width / 700) <= 1, scenario.name + ' editor x follows actual canvas scale');
        assert.ok(Math.abs(style.y - canvasBox.y - location.y * canvasBox.height / 400) <= 1, scenario.name + ' editor y follows actual canvas scale');
        assert.ok(pixel.before.pixels > 0, scenario.name + ' visible editing text');
        for (const key of ['minX', 'minY', 'maxX', 'maxY']) assert.ok(Math.abs(pixel.before[key] - pixel.after[key]) <= 1, scenario.name + ' matching visual ' + key);
        assert.equal(pixel.changedPixels, 0, scenario.name + ' editing/committed pixels');
        pass(scenario.name + ': 透明・装飾なし、入力/確定の表示ピクセル一致');
      }
    }
    if (!before) {
      for (const fill of ['light', 'solid']) {
        await fixture(); await page.locator('#fillMode').selectOption(fill); await clickAt(85, 80);
        await page.locator('#inlineTextEditor').fill('背景設定 ABC\n次の行');
        const editing = await capture('after-fill-' + fill + '-editing');
        assert.equal((await styles()).background, 'rgba(0, 0, 0, 0)');
        await page.locator('#inlineTextEditor').press('Enter');
        const committed = await capture('after-fill-' + fill + '-committed');
        const pixel = await compare(editing, committed); cases.push({ name: 'fill-' + fill, pixel });
        assert.equal(pixel.changedPixels, 0); pass('fillMode=' + fill + 'でも入力/確定の表示ピクセル一致');
      }
      await fixture(); await clickAt(73.4, 82.6); await page.locator('#inlineTextEditor').fill('編集中にズーム ABC\n日本語 123');
      await page.evaluate(() => setZoom(1.333));
      const zoomEditing = await capture('after-change-zoom-editing');
      await page.locator('#inlineTextEditor').press('Enter');
      const zoomCommitted = await capture('after-change-zoom-committed');
      const zoomPixel = await compare(zoomEditing, zoomCommitted); cases.push({ name: 'zoom-while-editing', pixel: zoomPixel });
      assert.equal(zoomPixel.changedPixels, 0); pass('編集中の133.3%ズーム変更に追従して入力/確定の表示ピクセル一致');
      // Re-edit a committed annotation and replace every character: the old text must not remain.
      await fixture(); await clickAt(90, 85); await page.locator('#inlineTextEditor').fill('元の文字 OLD');
      await page.locator('#inlineTextEditor').press('Enter');
      await clickAt(92, 90); await page.locator('#inlineTextEditor').fill('新しい文字 NEW');
      const reediting = await capture('after-reediting');
      await page.locator('#inlineTextEditor').press('Enter');
      const recommitted = await capture('after-recommitted');
      const reeditDiff = await compare(reediting, recommitted);
      cases.push({ name: 'reedit', pixel: reeditDiff }); assert.equal(reeditDiff.changedPixels, 0);
      assert.equal(await page.evaluate(() => annotations.length), 1);
      pass('既存文字を再編集しても二重表示せず入力/確定が一致');
      await clickAt(92, 90); await page.locator('#inlineTextEditor').fill('取消 CANCEL');
      await page.locator('#inlineTextEditor').press('Escape');
      assert.equal(await page.evaluate(() => annotations[0].text), '新しい文字 NEW');
      pass('Escで再編集を取り消して元の文字を復元');
      await clickAt(92, 90); await page.locator('#inlineTextEditor').fill('複数行');
      await page.locator('#inlineTextEditor').press('Shift+Enter'); await page.locator('#inlineTextEditor').press('x');
      assert.equal(await page.locator('#inlineTextEditor').inputValue(), '複数行\nx');
      await page.locator('#inlineTextEditor').dispatchEvent('compositionstart');
      await page.locator('#inlineTextEditor').dispatchEvent('keydown', { key: 'Enter', isComposing: true });
      assert.equal(await page.evaluate(() => editingText !== null), true);
      await page.locator('#inlineTextEditor').dispatchEvent('compositionend');
      await page.locator('#inlineTextEditor').press('Enter');
      assert.equal(await page.evaluate(() => annotations[0].text), '複数行\nx');
      pass('Shift+Enter改行、合成IME中のEnterで確定しない、変換後Enterで確定');
      await clickAt(92, 90); await page.locator('#inlineTextEditor').fill('PNG保存テスト ABC\n次の行');
      const download = page.waitForEvent('download'); await page.locator('#saveBtn2').click();
      const png = await download; await png.saveAs(path.join(output, 'export.png'));
      assert.equal(await page.evaluate(() => editingText), null);
      assert.equal(await page.evaluate(() => annotations[0].text), 'PNG保存テスト ABC\n次の行');
      const exported = fs.readFileSync(path.join(output, 'export.png'));
      assert.ok(exported.length > 1000);
      assert.equal(exported.readUInt32BE(16), 700); assert.equal(exported.readUInt32BE(20), 400);
      pass('入力中のPNG保存は確定して700×400のPNGを書き出す');
      await clickAt(92, 90);
      // A full desktop screenshot supplies a human-readable layout and editor-state record.
      await page.screenshot({ path: path.join(output, 'after-desktop.png'), fullPage: true });
      assert.deepEqual(errors, []); pass('ブラウザ実行エラーなし');
    }
  } finally {
    fs.writeFileSync(path.join(output, before ? 'before-results.json' : 'results.json'), JSON.stringify({ browser: await browser.version(), target, checks, cases, errors,
      limitations: ['IMEは合成compositionイベントで確認。OSの実IME変換は未実施。', 'OSの実クリップボードは対象外。'] }, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
