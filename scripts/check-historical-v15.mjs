import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { digest } from './release-inventory.mjs';
import { EXPLORER_CONTRACTS } from '../contracts/scripts/contract-list.mjs';

// This is the original approved V15 source, NOT today's candidate source.
const baseline = 'ce5ba32e49f87f1b6ae3b3ab11607517e91bf24a';
const frozen = ['release/protocol-build.json', 'release/solc-input.json', 'contracts/SHA256SUMS.txt'];
for (const name of EXPLORER_CONTRACTS) {
  for (const base of ['contracts/abi', 'apps/web/public/abi', 'apps/api/abi']) frozen.push(`${base}/${name}.abi.json`);
  frozen.push(`contracts/abi/${name}.artifact.json`);
}
for (const file of frozen) assert.deepEqual(readFileSync(file), execFileSync('git', ['show', `${baseline}:${file}`]), `HISTORICAL_V15_CHANGED:${file}`);
const manifest = JSON.parse(readFileSync('release/protocol-build.json', 'utf8'));
for (const [file, record] of Object.entries(manifest.sources)) assert.equal(digest(execFileSync('git', ['show', `${baseline}:${file}`])), record.sha256, `HISTORICAL_SOURCE_HASH:${file}`);
assert.equal(digest(readFileSync('release/solc-input.json')), manifest.standardJsonInputSha256);
console.log(`Historical V15 preserved: ${frozen.length} files; ${Object.keys(manifest.sources).length} source hashes verified against ${baseline}. Not V15.1 runtime evidence.`);
