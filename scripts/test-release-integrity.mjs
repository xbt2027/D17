import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collect, manifestText, verifyInventory, verifyPublicText, ROOTS, ROOT_FILES, MANIFEST } from './release-inventory.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'd17-release-integrity-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const put = (name, value = 'public\n') => { mkdirSync(path.dirname(path.join(root, name)), {recursive: true}); writeFileSync(path.join(root, name), value); };
  for (const name of ROOTS) mkdirSync(path.join(root, name), {recursive: true});
  for (const name of ROOT_FILES) put(name);
  put('contracts/contracts/Launch.sol');
  put('release/v15.1/artifacts/Launch.json', '{}\n');
  put('apps/web/.env.example', 'CHAIN_ID=1\n');
  put(MANIFEST, manifestText(root));
  return {root, put};
}
test('delivery includes versioned artifacts and source, excludes only declared transient outputs', t => {
  const {root, put} = fixture(t);
  for (const f of ['contracts/artifacts/cache.json', 'contracts/cache/state', 'apps/web/.next/generated', 'contracts/runs/log', 'apps/api/data/db']) put(f);
  const files = collect(root);
  assert.ok(files.includes('release/v15.1/artifacts/Launch.json'));
  assert.ok(files.includes('contracts/contracts/Launch.sol'));
  assert.ok(!files.includes('contracts/artifacts/cache.json'));
  verifyInventory(root); verifyPublicText(root);
});
for (const [label, mutate] of [
  ['source changed after hashing', ({put}) => put('contracts/contracts/Launch.sol', 'altered')],
  ['versioned bytecode changed', ({put}) => put('release/v15.1/artifacts/Launch.json', '{"bytecode":"bad"}')],
  ['new untracked public file', ({put}) => put('apps/web/public/unreviewed.js')],
  ['deleted file', ({root}) => rmSync(path.join(root, 'contracts/contracts/Launch.sol'))],
  ['duplicate checksum line', ({root, put}) => {const s=readFileSync(path.join(root, MANIFEST),'utf8');put(MANIFEST,s+s.split('\n')[0]+'\n');}],
  ['unexpected file named artifacts outside build directory', ({put}) => put('apps/web/public/artifacts/injected.js')],
]) test(`reject ${label}`, t => {const f=fixture(t);mutate(f);assert.throws(()=>verifyInventory(f.root), /INVENTORY_MISMATCH/);});
test('reject ignored env secrets even before checksum generation', t => {const {root,put}=fixture(t);put('apps/api/.env.mainnet','secret');assert.throws(()=>manifestText(root), /ENV_IN_RELEASE/);});
test('reject symlink escape', t => {const {root}=fixture(t);symlinkSync(tmpdir(),path.join(root,'apps/escape'));assert.throws(()=>collect(root),/SYMLINK_IN_RELEASE/);});
test('reject secrets in large files without printing secret bytes', t => {
  const {root,put}=fixture(t);
  put('apps/web/public/large.txt', 'a'.repeat(2_000_100)+'\n'+['PRIVATE','KEY'].join('_')+'=test-value');
  assert.throws(()=>verifyPublicText(root), /PUBLIC_TEXT:private key assignment:apps\/web\/public\/large.txt/);
});
test('reject missing required delivery root', t=>{const {root}=fixture(t);rmSync(path.join(root,'operations'),{recursive:true});assert.throws(()=>collect(root), /MISSING_RELEASE_ROOT/);});
test('separate evidence must not invalidate application digest', t=>{const {root,put}=fixture(t);put('evidence/check.log','raw evidence');put('coordination/W.md','status');verifyInventory(root);});

test('reject root environment secrets outside application subdirectories', t => {const {root,put}=fixture(t);put('.env','secret');assert.throws(()=>manifestText(root), /ENV_IN_RELEASE/);});
