'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { wrap } = require('node:module');
const ROOT = path.resolve(__dirname, '..');

function filesUnder(root) {
  const found = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'test-results') continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) found.push(file);
    }
  }
  visit(root);
  return found;
}

function attributes(source) {
  const result = new Map();
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of source.matchAll(pattern)) result.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
  return result;
}

function checkWorkspace(root = ROOT) {
  const errors = [];
  const files = filesUnder(root);
  let htmlCount = 0, jsCount = 0, inlineCount = 0, appCount = 0;
  const relative = file => path.relative(root, file);
  function syntax(source, filename, commonjs = false) {
    try { new vm.Script(commonjs ? wrap(source) : source, { filename }); }
    catch (error) { errors.push(filename + ': JavaScript構文エラー: ' + error.message); }
  }
  function localLink(file, value) {
    const href = value.replace(/&amp;/gi, '&').trim();
    if (!href || href.startsWith('#') || href.startsWith('?') || href.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(href)) return;
    let pathname;
    try { pathname = decodeURIComponent(href.split(/[?#]/, 1)[0]); }
    catch { errors.push(relative(file) + ': URLのエンコードが不正です: ' + href); return; }
    const target = pathname.startsWith('/') ? path.resolve(root, '.' + pathname) : path.resolve(path.dirname(file), pathname);
    const location = path.relative(root, target);
    if (location === '..' || location.startsWith('..' + path.sep) || path.isAbsolute(location)) {
      errors.push(relative(file) + ': リポジトリ外への相対参照: ' + href);
    } else if (!fs.existsSync(target)) errors.push(relative(file) + ': 参照先がありません: ' + href);
  }
  for (const file of files) {
    if (/\.(?:js|cjs)$/.test(file)) {
      jsCount++;
      syntax(fs.readFileSync(file, 'utf8'), relative(file), file.endsWith('.cjs'));
    }
    if (!file.endsWith('.html')) continue;
    htmlCount++;
    const html = fs.readFileSync(file, 'utf8');
    const tags = /<!--[\s\S]*?-->|<(\/?)([a-z][a-z\d:-]*)\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>/gi;
    let match;
    while ((match = tags.exec(html))) {
      if (!match[2] || match[1]) continue;
      const name = match[2].toLowerCase();
      const attrs = attributes(match[3]);
      for (const attr of ['href', 'src']) if (attrs.has(attr)) localLink(file, attrs.get(attr));
      if (name !== 'script' && name !== 'style') continue;
      const close = new RegExp('</' + name + '\\s*>', 'gi');
      close.lastIndex = tags.lastIndex;
      const end = close.exec(html);
      if (!end) { errors.push(relative(file) + ': </' + name + '> がありません。'); break; }
      if (name === 'script' && !attrs.has('src')) {
        const type = (attrs.get('type') || '').toLowerCase().trim();
        if (!type || /^(?:text|application)\/(?:java|ecma)script$/.test(type) || type === 'module') {
          inlineCount++;
          const line = html.slice(0, tags.lastIndex).split('\n').length;
          syntax(html.slice(tags.lastIndex, end.index), relative(file) + ':script@' + line);
        }
      }
      tags.lastIndex = close.lastIndex;
    }
  }
  try {
    const registryPath = path.join(root, 'apps/registry.js');
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(registryPath, 'utf8'), context, { filename: registryPath, timeout: 1000 });
    const { validateApps } = require(path.join(root, 'assets/catalog.js'));
    const apps = validateApps(context.WEB_APPS);
    appCount = apps.length;
    for (const app of apps) {
      const target = path.join(root, app.href);
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) errors.push('apps/registry.js: アプリ本体がありません: ' + app.href);
    }
  } catch (error) { errors.push('apps/registry.js: 登録一覧の検証失敗: ' + error.message); }
  for (const file of files.filter(file => /[\\/]\.(?:codex|claude)[\\/].*\.json$/.test(file))) {
    try { JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { errors.push(relative(file) + ': JSON構文エラー: ' + error.message); }
  }
  return { errors, htmlCount, jsCount, inlineCount, appCount };
}

if (require.main === module) {
  const result = checkWorkspace();
  if (result.errors.length) {
    process.stderr.write(result.errors.join('\n') + '\n');
    process.exitCode = 1;
  } else process.stdout.write('全体チェック合格: HTML ' + result.htmlCount + '件、JS/CJS ' + result.jsCount + '件、inline script ' + result.inlineCount + '件、登録アプリ ' + result.appCount + '件。\n');
}
module.exports = { checkWorkspace };
