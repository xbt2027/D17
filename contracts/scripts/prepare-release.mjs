#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readJson, writeJson, providerFromEnv, root } from './lib.mjs';
import { SUITE_NAMES, prepareDeployment, verifyDeployment, prepareFreeze, buildManifest, manifestSha256 } from './release-plan.mjs';
import { loadReleaseBuild } from './release-build.mjs';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const mode = arg('--mode', 'plan');
assert.ok(['build-manifest', 'plan', 'verify-pre-freeze', 'verify-freeze-progress', 'prepare-freeze', 'verify-frozen'].includes(mode), 'UNKNOWN_MODE');
const { artifacts, builds } = loadReleaseBuild(SUITE_NAMES);
const out = arg('--out', `runs/release/${mode}.json`);
function assertCommittedSource(commit) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(head, commit, 'POLICY_SOURCE_COMMIT_MISMATCH');
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' });
  assert.equal(dirty, '', 'COMMIT_TRACKED_CHANGES_BEFORE_PLAN');
}
if (mode === 'build-manifest') {
  const manifest = buildManifest(artifacts);
  writeJson(out, { manifest, sha256: manifestSha256(manifest) });
} else if (mode === 'plan') {
  const policy = readJson(arg('--policy', 'release-policy.json'));
  assertCommittedSource(policy.sourceCommit);
  writeJson(out, await prepareDeployment(policy, artifacts));
} else {
  const plan = readJson(arg('--plan', 'runs/release/plan.json'));
  const receipts = readJson(arg('--receipts', 'runs/release/receipts.json'));
  assertCommittedSource(plan.policy.sourceCommit);
  const provider = providerFromEnv();
  try {
    const phase = mode === 'verify-frozen' ? 'frozen' : mode === 'verify-freeze-progress' || (mode === 'prepare-freeze' && Object.keys(receipts.freezeTransactions || {}).length > 0) ? 'freezing' : 'pre-freeze';
    const report = await verifyDeployment({ provider, plan, artifacts, builds, receipts, phase });
    writeJson(mode === 'prepare-freeze' ? `${out}.verification.json` : out, report);
    assert.ok(report.ok, 'DEPLOYMENT_VERIFICATION_FAILED');
    if (mode === 'prepare-freeze') writeJson(out, prepareFreeze(plan, report));
  } finally { provider.destroy(); }
}
console.log(`Wrote ${out}. Unsigned/read-only only; mainnet remains NO-GO.`);
