#!/usr/bin/env node
// Stage V15.1 manifests from fresh, block-pinned two-RPC frozen-state proofs.
// No signature, broadcast, or automatic change to application deployment files.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ethers } from 'ethers';
import { readJson, writeJson, requireEnv, root } from './lib.mjs';
import { loadReleaseBuild } from './release-build.mjs';
import { SUITE_NAMES } from './release-plan.mjs';
import { preparePublication } from './publication.mjs';

const allowed = new Set(['--plan', '--receipts']);
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const name = process.argv[i], value = process.argv[i + 1];
  assert.ok(allowed.has(name) && value && !value.startsWith('--') && !args[name], 'Use --plan and --receipts; legacy deployment/verification reports are not accepted.');
  args[name] = value;
}
assert.ok(args['--plan'] && args['--receipts'], 'PLAN_AND_RECEIPTS_REQUIRED');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }), '', 'COMMIT_TRACKED_CHANGES_BEFORE_PUBLICATION');
const plan = readJson(args['--plan']), receipts = readJson(args['--receipts']);
assert.ok([1, 11155111].includes(plan.policy.chainId), 'PUBLIC_NETWORK_REQUIRED');
const primary = requireEnv('RPC_URL'), secondary = requireEnv('SECONDARY_RPC_URL');
assert.notEqual(primary, secondary, 'DISTINCT_RPC_ENDPOINTS_REQUIRED');
const providers = [primary, secondary].map(url => new ethers.JsonRpcProvider(url));
try {
  const { artifacts, builds } = loadReleaseBuild(SUITE_NAMES);
  const { manifest, provenance } = await preparePublication({ providers, plan, receipts, artifacts, builds, sourceCommit });
  const out = path.join('runs', 'publication', `${manifest.network}-${plan.planSha256}`);
  for (const directory of ['deployments', 'apps/web/deployments', 'apps/api/deployments', 'contracts/deployments']) {
    writeJson(path.join(out, directory, `${manifest.network}.json`), manifest);
  }
  writeJson(path.join(out, 'release/deployments', `${manifest.network}.json`), provenance);
  console.log(`Staged verified V15.1 files at ${out}. Application manifests unchanged; independent release acceptance and explicit promotion still required. MAINNET NO-GO.`);
} finally { for (const provider of providers) provider.destroy(); }
