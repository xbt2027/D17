import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = 'SHARING_SHA256SUMS.txt';
const ignored = new Set(['.git', 'node_modules', '.next', '.vercel', 'artifacts', 'cache', 'runs', '__pycache__']);
const files = [];
function walk(dir, rel = '') {
  for (const name of readdirSync(dir).sort()) {
    const archivedArtifacts = name === 'artifacts' && rel === 'release/v15.1';
    if ((ignored.has(name) && !archivedArtifacts) || name === '.DS_Store' || name.endsWith('.tsbuildinfo')) continue;
    const full = path.join(dir, name), next = rel ? `${rel}/${name}` : name;
    const stat = lstatSync(full);
    assert.ok(!stat.isSymbolicLink(), `Unexpected symbolic link: ${next}`);
    if (stat.isDirectory()) walk(full, next);
    else if (next !== manifest) files.push(next);
  }
}
walk(root);
const expected = new Map(readFileSync(path.join(root, manifest), 'utf8').trim().split('\n').map(line => {
  const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
  assert.ok(match, 'Invalid sharing manifest row');
  return [match[2], match[1]];
}));
assert.deepEqual(files.sort(), [...expected.keys()].sort(), 'Sharing file inventory differs');
for (const file of files) {
  const hash = createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex');
  assert.equal(hash, expected.get(file), `File checksum differs: ${file}`);
}
const build = JSON.parse(readFileSync(path.join(root, 'release/v15.1/protocol-build.json'), 'utf8'));
for (const [file, expectedHash] of Object.entries(build.sourceSha256)) {
  const actualHash = createHash('sha256').update(readFileSync(path.join(root, 'contracts', file))).digest('hex');
  assert.equal(actualHash, expectedHash, `Candidate Solidity source differs: ${file}`);
}
console.log(`Sharing inventory: ${files.length} files verified. Candidate Solidity hashes: ${Object.keys(build.sourceSha256).length} verified. No release approval is implied.`);
