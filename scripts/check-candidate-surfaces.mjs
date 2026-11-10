import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { abiBasePath, requiresCompleteSettlement } from '../apps/web/lib/protocol-version.mjs';
import { buildSiteContent, SITE_CONTENT_PATH } from './sync-site-content.mjs';
const read = f => readFileSync(f, 'utf8');
for (const network of ['sepolia', 'mainnet']) {
  const raw = read(`deployments/${network}.json`), m = JSON.parse(raw);
  for (const base of ['apps/web', 'apps/api', 'contracts']) assert.equal(read(`${base}/deployments/${network}.json`), raw);
  const provenance = JSON.parse(read(`release/deployments/${network}.json`));
  for (const key of ['chainId','startBlock','status']) assert.equal(provenance[key], m[key]);
  for (const [name,address] of Object.entries(m.contracts)) assert.equal(address.toLowerCase(), provenance.contracts[name].toLowerCase());
  assert.equal(m.protocolVersion, network === 'mainnet' ? 'V15_1' : 'V15_HARDENED');
}
assert.equal(read(SITE_CONTENT_PATH), buildSiteContent());
assert.equal(abiBasePath('V15_1'), '/abi/v15.1');
assert.equal(abiBasePath('V15_HARDENED'), '/abi');
assert.ok(requiresCompleteSettlement('V15_1') && !requiresCompleteSettlement('V15_HARDENED'));
assert.throws(() => abiBasePath('unknown'));
const rejected = spawnSync(process.execPath, ['src/server.mjs'], {
  cwd: 'apps/api', encoding: 'utf8', timeout: 5000,
  env: {...process.env, LOAD_DOTENV: '0', INDEX_DISABLED: '1', CHAIN_ID: '1', FACTORY_DEPLOYMENT_FILE: './deployments/mainnet.json', D17_PROTOCOL_VERSION: 'V15_HARDENED'},
});
assert.equal(rejected.status, 1); assert.match(rejected.stderr, /ABI version conflicts/);
console.log('Candidate manifest copies, provenance, docs content, ABI selection and fail-closed API version mismatch: PASS. No deployment authorization.');
