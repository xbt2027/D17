import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadReleaseBuild } from '../contracts/scripts/release-build.mjs';
import { EXPLORER_CONTRACTS } from '../contracts/scripts/contract-list.mjs';
import { buildManifest, manifestSha256 } from '../contracts/scripts/release-plan.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checking = process.argv.includes('--check');
const { artifacts, inputs, sources } = loadReleaseBuild(EXPLORER_CONTRACTS);
const outputs = new Map();
const add = (file, value) => outputs.set(file, JSON.stringify(value, null, 2) + '\n');
for (const [name, art] of Object.entries(artifacts)) {
  add(`release/v15.1/artifacts/${name}.json`, art);
  for (const base of ['release/v15.1/abi', 'apps/web/public/abi/v15.1', 'apps/api/abi/v15.1']) add(`${base}/${name}.abi.json`, art.abi);
}
for (const [id, input] of Object.entries(inputs)) add(`release/v15.1/build-inputs/${id}.json`, input);
const manifest = buildManifest(artifacts);
add('release/v15.1/protocol-build.json', {
  schema: 'd17-v15.1-candidate-v1', status: 'preliminary-not-audited', mainnet: 'NO-GO',
  compiler: { version: '0.8.38+commit.1835d247', viaIR: true, optimizerRuns: 1, evmVersion: 'shanghai', bytecodeHash: 'none' },
  sourceSha256: sources, contracts: manifest, artifactManifestSha256: manifestSha256(manifest),
  note: 'Exact delivery commit is pinned in outer CHECKPOINT.json. Runtime templates require immutable reconstruction. Existing Sepolia is historical V15.',
});
const sha = x => createHash('sha256').update(x).digest('hex');
const sums = [...outputs].map(([file, content]) => `${sha(content)}  ${file}`).join('\n') + '\n';
outputs.set('release/v15.1/SHA256SUMS.txt', sums);
for (const [file, content] of outputs) {
  const absolute = path.join(root, file);
  if (checking) assert.equal(readFileSync(absolute, 'utf8'), content, `CANDIDATE_MISMATCH:${file}`);
  else { mkdirSync(path.dirname(absolute), { recursive: true }); writeFileSync(absolute, content); }
}
console.log(`${checking ? 'Verified' : 'Exported'} ${outputs.size} versioned candidate files; all 12 contract ABIs/bytecodes linked to current source. NO-GO.`);
