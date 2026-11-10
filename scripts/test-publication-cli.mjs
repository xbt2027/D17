import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = ['deployments', 'apps/web/deployments', 'apps/api/deployments', 'contracts/deployments', 'release/deployments']
  .flatMap(dir => ['mainnet', 'sepolia'].map(net => `${root}${dir}/${net}.json`));
for (const [name, args, reason] of [
  ['empty invocation', [], 'PLAN_AND_RECEIPTS_REQUIRED'],
  ['legacy saved verification', ['--deployment', 'old.json', '--verification', 'ok.json'], 'legacy deployment/verification reports are not accepted'],
  ['unsupported apply flag', ['--apply', 'true'], 'legacy deployment/verification reports are not accepted'],
  ['incomplete plan', ['--plan', 'plan.json'], 'PLAN_AND_RECEIPTS_REQUIRED'],
  ['duplicate plan', ['--plan', 'a.json', '--plan', 'b.json', '--receipts', 'receipts.json'], 'legacy deployment/verification reports are not accepted'],
]) test(`publication CLI rejects ${name} without changing public files`, () => {
  const before = files.map(file => readFileSync(file));
  const result = spawnSync(process.execPath, ['contracts/scripts/publish-deployment.mjs', ...args], {
    cwd: root, encoding: 'utf8', timeout: 10000,
    env: { ...process.env, RPC_URL: 'http://127.0.0.1:1', SECONDARY_RPC_URL: 'http://127.0.0.1:2' },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes(reason), result.stderr);
  files.forEach((file, i) => assert.deepEqual(readFileSync(file), before[i], file));
});
