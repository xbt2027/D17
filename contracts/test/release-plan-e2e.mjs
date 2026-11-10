import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ethers } from 'ethers';
import { artifact, compile, root, startNode, waitForRpc, deploy, wait } from './helpers.mjs';
import { v2Artifact } from './release-fixture.mjs';
import { SUITE_NAMES, prepareDeployment, verifyDeployment, prepareFreeze, buildManifest, manifestSha256 } from '../scripts/release-plan.mjs';
import { preparePublication } from '../scripts/publication.mjs';

const report = { schema: 'd17-release-plan-e2e-v1', status: 'running', checks: [], verifications: [], transactions: [] };
const check = (label, value) => { report.checks.push({ label, ok: Boolean(value) }); assert.ok(value, label); };
async function rejects(label, fn, pattern) { await assert.rejects(fn, pattern); check(label, true); }
compile();
const child = startNode(9920); let provider;
try {
  provider = await waitForRpc(9920, child);
  const signers = await Promise.all([0, 1, 2, 3].map(i => provider.getSigner(i)));
  const addresses = await Promise.all(signers.map(s => s.getAddress()));
  const weth = await deploy('test/TestWETH.sol', 'TestWETH', signers[0]);
  const va = v2Artifact('UniswapV2Factory');
  const v2 = await new ethers.ContractFactory(va.abi, va.bytecode, signers[0]).deploy(addresses[0]); await v2.waitForDeployment();
  const router = await deploy('test/TestV2Router.sol', 'TestV2Router', signers[0], [await v2.getAddress()]);
  const dependencies = {};
  for (const [name, contract] of Object.entries({ weth, router, routerFactory: v2 })) {
    const address = await contract.getAddress(); dependencies[name] = { address, runtimeKeccak256: ethers.keccak256(await provider.getCode(address)) };
  }
  const artifacts = Object.fromEntries(SUITE_NAMES.map(n => [n, artifact(`${n}.sol`, n)]));
  const builds = Object.fromEntries(SUITE_NAMES.map(n => [n, JSON.parse(readFileSync(path.join(root, 'artifacts/build-info', `${artifacts[n].buildInfoId}.output.json`), 'utf8'))]));
  const nonces = Object.fromEntries(await Promise.all(addresses.slice(0, 3).map(async a => [a, Number(BigInt(await provider.send('eth_getTransactionCount', [a, 'latest'])))])));
  const policy = { schema: 'd17-reviewed-fee-policy-v1', chainId: 31337, sourceCommit: 'c20e5a01f62cbd4b9e80ad58389abf118150964e',
    buildManifestSha256: manifestSha256(buildManifest(artifacts)), protocolFeeBps: 200, feeSplitBps: [5000, 1250, 1250, 2500],
    feeSplitRecipients: await Promise.all([16,17,18,19].map(async i => (await provider.getSigner(i)).getAddress())),
    factoryDeployer: addresses[0], launchDeployer: addresses[1], lockerDeployer: addresses[2], feeConfigOwner: addresses[3], nonces, dependencies, confirmations: 1 };
  const plan = await prepareDeployment(policy, artifacts);
  check('deterministic plan', JSON.stringify(plan) === JSON.stringify(await prepareDeployment(policy, artifacts)));
  check('8 creations and 5 pins; no automatic freeze', plan.transactions.length === 13 && !plan.transactions.some(t => t.kind === 'freeze'));
  await rejects('missing real recipients rejected', () => prepareDeployment({ ...policy, feeSplitRecipients: [] }, artifacts), /POLICY_FOUR_RECIPIENTS/);
  await rejects('wrong build rejected', () => prepareDeployment({ ...policy, buildManifestSha256: '0'.repeat(64) }, artifacts), /BUILD_MANIFEST_MISMATCH/);
  await rejects('noncanonical mainnet dependency rejected', () => prepareDeployment({ ...policy, chainId: 1, confirmations: 12 }, artifacts), /NONCANONICAL_MAINNET_DEPENDENCY/);
  const receipts = { transactions: {}, freezeTransactions: {} };
  for (const tx of plan.transactions) {
    const signer = signers[addresses.indexOf(tx.from)];
    const sent = await signer.sendTransaction({ to: tx.to, value: 0, nonce: tx.nonce, data: tx.data, gasLimit: 15_000_000 });
    const mined = await wait(sent); receipts.transactions[tx.id] = sent.hash;
    report.transactions.push({ id: tx.id, gasUsed: String(mined.gasUsed), initCodeBytes: tx.kind === 'create' ? (tx.data.length - 2) / 2 : null });
    if (tx.kind === 'create') check(`predicted CREATE address ${tx.contract}`, mined.contractAddress === tx.creates);
  }
  const verify = (extra = {}) => verifyDeployment({ provider, plan, artifacts, builds, receipts, ...extra });
  const valid = await verify();
  // A second local adapter, not an independently operated/live RPC.
  const secondProvider = new Proxy(provider, { get(target, key) {
    const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
  } });
  const publication = extra => preparePublication({ providers: [provider, secondProvider], plan, receipts, artifacts, builds, sourceCommit: policy.sourceCommit, ...extra });
  await rejects('publication refuses unfrozen state', () => publication(), /FRESH_FROZEN_VERIFICATION_REQUIRED/);
  report.verifications.push(valid); check('full pre-freeze proof passes', valid.ok);
  check('all 8 runtimes proved', valid.runtimeProofs.length === 8 && valid.runtimeProofs.every(r => r.matches));
  check('all 13 receipts proved', valid.receiptProofs.length === 13);
  check('all suite creations within 49152-byte initcode and 16777216-gas execution budget', report.transactions.every(t => t.initCodeBytes === null || (t.initCodeBytes <= 49152 && BigInt(t.gasUsed) < 16777216n)));
  const changedBlock = new Proxy(provider, { get(target, key) {
    if (key === 'send') return async (method, args) => {
      const value = await target.send(method, args);
      if (method === 'eth_getBlockByNumber' && args[0] === ethers.toQuantity(valid.blockNumber)) {
        changedBlockReads++;
        if (changedBlockReads > 1) return { ...value, hash: '0x' + 'aa'.repeat(32) };
      }
      return value;
    };
    const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
  } });
  let changedBlockReads = 0;
  check('reorg during verification rejected', !(await verify({ provider: changedBlock, blockNumber: valid.blockNumber })).ok);
  const unsigned = prepareFreeze(plan, valid);
  check('freeze instructions ordered FeeConfig first, Factory last', unsigned.calls.length === 5 && unsigned.calls[0].contract === 'D17FeeConfig' && unsigned.calls[4].contract === 'D17Factory');
  check('freeze generation did not mutate chain', (await verify()).ok);
  const missing = await verify({ receipts: { transactions: {} } });
  check('missing transaction proofs fail', !missing.ok);
  const swappedReceipts = structuredClone(receipts);
  swappedReceipts.transactions[plan.transactions[0].id] = receipts.transactions[plan.transactions[1].id];
  check('mismatched creation transaction fails', !(await verify({ receipts: swappedReceipts })).ok);
  await rejects('tampered plan rejected', () => verify({ plan: { ...plan, addresses: { ...plan.addresses, D17Factory: ethers.ZeroAddress } } }), /PLAN_DIGEST/);
  await rejects('unconfirmed block rejected', async () => verify({ blockNumber: Number(BigInt(await provider.send('eth_blockNumber', []))) + 1 }), /UNCONFIRMED_BLOCK/);
  const wrongChain = { send: (method, args) => method === 'eth_chainId' ? Promise.resolve('0x1') : provider.send(method, args) };
  await rejects('wrong RPC chain rejected', () => verify({ provider: wrongChain }), /RPC_CHAIN_ID/);
  let snapshot = await provider.send('evm_snapshot', []);
  const fee = new ethers.Contract(plan.addresses.D17FeeConfig, artifacts.D17FeeConfig.abi, signers[3]);
  await wait(await fee.setProtocolFee(plan.addresses.D17FeeSplitter, 199));
  check('pre-freeze fee mutation detected', !(await verify()).ok);
  await provider.send('evm_revert', [snapshot]); snapshot = await provider.send('evm_snapshot', []);
  await wait(await fee.transferOwnership(addresses[0]));
  check('pending ownership detected', !(await verify()).ok);
  await provider.send('evm_revert', [snapshot]); snapshot = await provider.send('evm_snapshot', []);
  await provider.send('hardhat_setCode', [plan.addresses.D17Factory, '0x00']);
  await rejects('altered runtime prevents successful proof', () => verify(), /./);
  await provider.send('evm_revert', [snapshot]);
  for (const tx of unsigned.calls) {
    const signer = signers[addresses.indexOf(tx.from)];
    const sent = await signer.sendTransaction({ to: tx.to, value: 0, data: tx.data }); await wait(sent);
    receipts.freezeTransactions[tx.contract] = sent.hash;
    const count = Object.keys(receipts.freezeTransactions).length;
    if (count < 5) {
      const progress = await verify({ phase: 'freezing' });
      check(`partial freeze ${count}/5 runtime and receipt verification`, progress.ok);
      check(`partial freeze ${count}/5 emits only remaining calls`, prepareFreeze(plan, progress).calls.length === 5 - count);
      const corrupt = structuredClone(receipts); delete corrupt.freezeTransactions.D17FeeConfig;
      if (count > 1) await rejects(`out-of-order freeze ${count}/5 rejected`, () => verify({phase:'freezing',receipts:corrupt}), /FREEZE_ORDER/);
    }
  }
  const frozen = await verify({ phase: 'frozen' });
  report.verifications.push(frozen); check('frozen runtime, graph and ownership receipts pass', frozen.ok);
  const staged = await publication();
  check('publication selects current V15.1 ABI family', staged.manifest.protocolVersion === 'V15_1');
  check('publication binds source, build and deterministic plan', staged.provenance.sourceCommit === policy.sourceCommit && staged.provenance.planSha256 === plan.planSha256 && staged.provenance.buildManifestSha256 === policy.buildManifestSha256);
  check('publication derives startBlock from actual creation receipts', staged.manifest.startBlock === Math.min(...frozen.receiptProofs.filter(r => r.id.startsWith('deploy:')).map(r => r.blockNumber)));
  check('publication retains two fresh frozen proofs without GO', staged.provenance.verificationReports.length === 2 && staged.provenance.mainnetDecision === 'NO-GO' && staged.provenance.publicationStatus === 'staged-only');
  check('staged explorer inputs retain all eight proven creation transactions', Object.keys(staged.provenance.transactions).length === 8 && Object.values(staged.provenance.transactions).every(hash => frozen.receiptProofs.some(r => r.id.startsWith('deploy:') && r.hash === hash)));
  await rejects('publication rejects other source commit', () => publication({ sourceCommit: '0'.repeat(40) }), /PUBLICATION_SOURCE_COMMIT/);
  await rejects('publication rejects one provider', () => publication({ providers: [provider] }), /TWO_RPC_PROVIDERS_REQUIRED/);
  await rejects('publication rejects duplicate provider object', () => publication({ providers: [provider, provider] }), /TWO_RPC_PROVIDERS_REQUIRED/);
  await rejects('publication rejects missing receipts', () => publication({ receipts: { transactions: {} } }), /FRESH_FROZEN_VERIFICATION_REQUIRED/);
  await rejects('publication rejects tampered plan', () => publication({ plan: { ...plan, addresses: { ...plan.addresses, D17Factory: ethers.ZeroAddress } } }), /PLAN_DIGEST/);
  const disagreeing = new Proxy(provider, { get(target, key) {
    if (key === 'send') return async (method, args) => {
      const result = await target.send(method, args);
      return method === 'eth_getBlockByNumber' && args[0] === ethers.toQuantity(frozen.blockNumber + 1) ? { ...result, hash: '0x' + 'ab'.repeat(32) } : result;
    };
    const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
  } });
  await provider.send('evm_mine', []);
  await rejects('publication rejects stable RPC fork disagreement', () => publication({ providers: [provider, disagreeing] }), /RPC_BLOCK_DISAGREEMENT/);
  check('frozen state rejected as pre-freeze', !(await verify()).ok);
  check('frozen state without receipts rejected', !(await verify({ phase: 'frozen', receipts: { transactions: receipts.transactions } })).ok);
  const badFreeze = structuredClone(receipts); badFreeze.freezeTransactions.D17FeeConfig = receipts.transactions[plan.transactions[0].id];
  check('unrelated ownership receipt rejected', !(await verify({ phase: 'frozen', receipts: badFreeze })).ok);
  await rejects('fee immutable after freeze', () => fee.setProtocolFee(plan.addresses.D17FeeSplitter, 199), /NOT_OWNER/);
  report.status = 'passed'; report.planSha256 = plan.planSha256;
} catch (error) { report.status = 'failed'; report.error = String(error.stack); throw error; }
finally {
  mkdirSync('runs/security', { recursive: true });
  writeFileSync('runs/security/release-plan.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, error: report.error }, null, 2));
  provider?.destroy(); await child.kill('SIGTERM');
}
