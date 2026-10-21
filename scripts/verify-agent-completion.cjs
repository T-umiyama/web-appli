'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');

function evaluateCompletion(event, tool, { root = ROOT, run = spawnSync } = {}) {
  const expected = tool === 'codex' ? ['Stop', 'SubagentStop'] : ['TaskCompleted'];
  if (!event || !expected.includes(event.hook_event_name)) throw new Error('不正なhookイベントです。');
  if (event.hook_event_name === 'SubagentStop' && !/^web_(ui|domain|backend|data)$/.test(event.agent_type || '')) return { exitCode: 0, output: {} };
  const commands = [[process.execPath, [path.join(root, 'scripts/check-workspace.cjs')]]];
  const testsDirectory = path.join(root, 'tests');
  const repositoryTests = fs.existsSync(testsDirectory)
    ? fs.readdirSync(testsDirectory).filter(name => name.endsWith('.test.cjs')).sort().map(name => path.join(testsDirectory, name))
    : [];
  if (repositoryTests.length) commands.push([process.execPath, ['--test', ...repositoryTests]]);
  const skipped = [];
  const packagePath = path.join(root, 'package.json');
  if (fs.existsSync(packagePath)) {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    for (const name of ['check', 'test']) {
      if (typeof pkg.scripts?.[name] === 'string' && pkg.scripts[name].trim()) commands.push(['npm', ['run', name]]);
      else skipped.push('npm run ' + name);
    }
  } else skipped.push('npm check/test（package.jsonなし）');
  for (const [cmd, args] of commands) {
    let result;
    try { result = run(cmd, args, { cwd: root, encoding: 'utf8', shell: cmd === 'npm' && process.platform === 'win32', timeout: 60000, maxBuffer: 8 * 1024 * 1024 }); }
    catch (error) { result = { error }; }
    if (result?.status === 0 && !result.error && !result.signal) continue;
    const reason = '未完：' + cmd + ' ' + args.join(' ') + ' が失敗・実行不能でした。\n' +
      [result?.stdout, result?.stderr, result?.error?.message, result?.signal].filter(Boolean).join('\n').slice(-10000);
    if (tool === 'codex' && event.stop_hook_active === true) return { exitCode: 0, output: { continue: false, stopReason: reason, systemMessage: reason + '\n再試行を止めます。合格ではありません。未完として報告してください。' } };
    return { exitCode: 2, error: reason };
  }
  return { exitCode: 0, output: skipped.length ? { systemMessage: '未定義のため未実行：' + skipped.join('、') + '。個別アプリの受入試験・ブラウザ確認は別途必要です。' } : {} };
}
function runCommand(tool) {
  try {
    const result = evaluateCompletion(JSON.parse(fs.readFileSync(0, 'utf8')), tool);
    if (result.output) process.stdout.write(JSON.stringify(result.output) + '\n');
    if (result.error) process.stderr.write(result.error + '\n');
    process.exitCode = result.exitCode;
  } catch (error) { process.stderr.write('未完：完了チェックを実行できません。' + String(error) + '\n'); process.exitCode = 2; }
}
module.exports = { evaluateCompletion, runCommand };
