'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { evaluateCompletion } = require('../scripts/verify-agent-completion.cjs');

function fixture(t, pkg) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'web-appli-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  if (pkg !== undefined) fs.writeFileSync(path.join(root, 'package.json'), typeof pkg === 'string' ? pkg : JSON.stringify(pkg));
  return root;
}
const event = changes => ({ hook_event_name: 'Stop', ...changes });

test('成功時はrootチェックと定義済みnpm scriptsだけを順に実行しイベントcwdを無視する', t => {
  const root = fixture(t, { scripts: { check: 'node check.cjs', test: 'node --test tests/*.test.cjs' } });
  const calls = [];
  const result = evaluateCompletion(event({ cwd: '/untrusted-event-path' }), 'codex', { root, run: (...args) => { calls.push(args); return { status: 0 }; } });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(calls.map(call => [call[0], call[1]]), [
    [process.execPath, [path.join(root, 'scripts/check-workspace.cjs')]], ['npm', ['run', 'check']], ['npm', ['run', 'test']]
  ]);
  for (const [command, , options] of calls) {
    assert.equal(options.cwd, root);
    assert.equal(options.timeout, 60000);
    assert.equal(options.encoding, 'utf8');
    assert.equal(options.shell, process.platform === 'win32' && command === 'npm');
  }
});

test('packageが無ければnpm未実行を明示する', t => {
  const root = fixture(t);
  let count = 0;
  const result = evaluateCompletion(event(), 'codex', { root, run: () => { count++; return { status: 0 }; } });
  assert.equal(count, 1);
  assert.equal(result.exitCode, 0);
  assert.match(result.output.systemMessage, /package\.jsonなし/);
});

test('リポジトリの単体試験が失敗したときはnpm scriptsへ進まず完了を止める', t => {
  const root = fixture(t, { scripts: { check: 'defined', test: 'defined' } });
  fs.mkdirSync(path.join(root, 'tests'));
  fs.writeFileSync(path.join(root, 'tests', 'regression.test.cjs'), '');
  const calls = [];
  const result = evaluateCompletion(event(), 'codex', { root, run: (cmd, args) => {
    calls.push([cmd, args]);
    return args[0] === '--test' ? { status: 1, stderr: 'repository regression' } : { status: 0 };
  } });
  assert.equal(result.exitCode, 2);
  assert.equal(calls.length, 2);
  assert.match(result.error, /repository regression/);
});

test('未定義・空のscriptは合格として実行せずスキップを明示する', t => {
  const root = fixture(t, { scripts: { check: '  ', test: false } });
  let count = 0;
  const result = evaluateCompletion(event(), 'codex', { root, run: () => { count++; return { status: 0 }; } });
  assert.equal(count, 1);
  assert.match(result.output.systemMessage, /npm run check/);
  assert.match(result.output.systemMessage, /npm run test/);
});

test('最初の失敗で後続を止め、stderrを含む未完理由を返す', t => {
  const root = fixture(t, { scripts: { check: 'defined', test: 'defined' } });
  let count = 0;
  const result = evaluateCompletion(event(), 'codex', { root, run: () => { count++; return { status: 1, stderr: 'fixture failure' }; } });
  assert.equal(count, 1);
  assert.equal(result.exitCode, 2);
  assert.match(result.error, /fixture failure/);
});

test('タイムアウト・シグナル・spawn例外を合格にしない', t => {
  const root = fixture(t);
  const timeout = new Error('spawn ETIMEDOUT');
  timeout.code = 'ETIMEDOUT';
  for (const run of [() => ({ status: null, error: timeout }), () => ({ status: 0, signal: 'SIGTERM' }), () => { throw new Error('spawn unavailable'); }]) {
    const result = evaluateCompletion(event(), 'codex', { root, run });
    assert.equal(result.exitCode, 2);
    assert.match(result.error, /未完/);
  }
});

test('Codex再継続の失敗は自動再試行を止めて未完を報告する', t => {
  const root = fixture(t);
  const result = evaluateCompletion(event({ stop_hook_active: true }), 'codex', { root, run: () => ({ status: 1 }) });
  assert.equal(result.exitCode, 0);
  assert.equal(result.output.continue, false);
  assert.match(result.output.stopReason, /未完/);
  assert.match(result.output.systemMessage, /合格ではありません/);
});

test('読取専用の子担当は実行せず、実装担当とClaude TaskCompletedは検証する', t => {
  const root = fixture(t);
  let count = 0;
  const options = { root, run: () => { count++; return { status: 0 }; } };
  evaluateCompletion(event({ hook_event_name: 'SubagentStop', agent_type: 'web_verifier' }), 'codex', options);
  assert.equal(count, 0);
  evaluateCompletion(event({ hook_event_name: 'SubagentStop', agent_type: 'web_ui' }), 'codex', options);
  evaluateCompletion(event({ hook_event_name: 'TaskCompleted' }), 'claude', options);
  assert.equal(count, 2);
  assert.throws(() => evaluateCompletion(event({ hook_event_name: 'Shell' }), 'codex', options), /イベント/);
  assert.throws(() => evaluateCompletion(event(), 'claude', options), /イベント/);
});

test('壊れたpackage.jsonはspawn前に拒否する', t => {
  const root = fixture(t, '{ invalid json');
  let count = 0;
  assert.throws(() => evaluateCompletion(event(), 'codex', { root, run: () => { count++; return { status: 0 }; } }), SyntaxError);
  assert.equal(count, 0);
});
