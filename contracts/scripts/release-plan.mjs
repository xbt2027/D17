import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ethers } from 'ethers';
import { validateFeePolicy, compareRuntimeBytecode } from './runtime-bytecode.mjs';

export const MAINNET_DEPENDENCIES = {
  weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
  routerFactory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
};
const same = (a, b) => ethers.getAddress(a) === ethers.getAddress(b);
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const validAddress = a => { const v = ethers.getAddress(a); assert.notEqual(v, ethers.ZeroAddress, 'ZERO_ADDRESS'); return v; };

// The policy is a separately reviewed input. A hash is a binding, not an attestation
// that the address belongs to the named recipient, or that a Safe is configured well.
export function validateReleasePolicy(input) {
  const p = validateFeePolicy(input, input.chainId);
  assert.ok(p.chainId > 0, 'CHAIN_ID_POSITIVE');
  assert.match(p.sourceCommit, /^[a-f0-9]{40}$/, 'SOURCE_COMMIT');
  assert.match(p.buildManifestSha256, /^[a-f0-9]{64}$/, 'BUILD_MANIFEST_SHA256');
  assert.ok(Number.isSafeInteger(p.confirmations) && p.confirmations >= (p.chainId === 31337 ? 1 : 12), 'CONFIRMATIONS');
  for (const key of ['factoryDeployer', 'launchDeployer', 'lockerDeployer', 'feeConfigOwner']) validAddress(p[key]);
  for (const key of Object.keys(MAINNET_DEPENDENCIES)) {
    validAddress(p.dependencies[key].address);
    assert.match(p.dependencies[key].runtimeKeccak256, /^0x[a-fA-F0-9]{64}$/, 'DEPENDENCY_CODE_HASH');
    if (p.chainId === 1) assert.ok(same(p.dependencies[key].address, MAINNET_DEPENDENCIES[key]), 'NONCANONICAL_MAINNET_DEPENDENCY');
  }
  for (const a of new Set([p.factoryDeployer, p.launchDeployer, p.lockerDeployer].map(ethers.getAddress))) {
    assert.ok(Number.isSafeInteger(p.nonces[a]) && p.nonces[a] >= 0, 'DEPLOYER_NONCE');
  }
  return p;
}

export function buildManifest(artifacts) {
  return Object.fromEntries(Object.entries(artifacts).sort(([a], [b]) => a.localeCompare(b)).map(([name, art]) => [name, {
    abiSha256: hash(art.abi), creationKeccak256: ethers.keccak256(art.bytecode),
    runtimeTemplateKeccak256: ethers.keccak256(art.deployedBytecode),
    immutableReferences: art.immutableReferences,
  }]));
}

export const SUITE_NAMES = ['D17FeeSplitter', 'D17FeeConfig', 'D17Factory', 'D17TokenFactory',
  'D17LiquidityVaultFactory', 'D17LaunchDeployer', 'D17LaunchFactory', 'D17LockerFactory'];
export const FREEZE_ORDER = ['D17FeeConfig', 'D17TokenFactory', 'D17LiquidityVaultFactory', 'D17LaunchDeployer', 'D17Factory'];

// Pure, deterministic, unsigned instructions. No RPC, signer, private key or send call.
export async function prepareDeployment(input, artifacts) {
  const policy = validateReleasePolicy(input);
  assert.equal(hash(buildManifest(artifacts)), policy.buildManifestSha256, 'BUILD_MANIFEST_MISMATCH');
  const nonces = { ...policy.nonces }, addresses = {}, transactions = [], constructors = {};
  const takeNonce = from => { const a = ethers.getAddress(from); return nonces[a]++; };
  async function deploy(name, from, args) {
    from = ethers.getAddress(from);
    const nonce = takeNonce(from), address = ethers.getCreateAddress({ from, nonce });
    const art = artifacts[name];
    assert.ok(art && art.bytecode !== '0x', `MISSING_ARTIFACT:${name}`);
    assert.equal(Object.keys(art.linkReferences || {}).length, 0, 'UNRESOLVED_LINKS');
    const tx = await new ethers.ContractFactory(art.abi, art.bytecode).getDeployTransaction(...args);
    addresses[name] = address; constructors[name] = args;
    transactions.push({ id: `deploy:${name}`, kind: 'create', contract: name, chainId: policy.chainId, from, nonce, to: null, value: '0', data: tx.data, creates: address });
    return address;
  }
  function pin(name, method, value, from) {
    from = ethers.getAddress(from);
    transactions.push({ id: `pin:${name}:${method}`, kind: 'pin', contract: name, chainId: policy.chainId,
      from, nonce: takeNonce(from), to: addresses[name], value: '0',
      data: new ethers.Interface(artifacts[name].abi).encodeFunctionData(method, [value]) });
  }
  const { factoryDeployer: f, launchDeployer: l, lockerDeployer: k, feeConfigOwner: o } = policy;
  const weth = policy.dependencies.weth.address, router = policy.dependencies.router.address;
  const splitter = await deploy('D17FeeSplitter', f, [weth, policy.feeSplitRecipients, policy.feeSplitBps]);
  const fee = await deploy('D17FeeConfig', f, [o, splitter, 200]);
  const factory = await deploy('D17Factory', f, [f, weth, router, fee]);
  const tf = await deploy('D17TokenFactory', l, [l]);
  const vf = await deploy('D17LiquidityVaultFactory', l, [l]);
  const ld = await deploy('D17LaunchDeployer', l, [l]);
  const lf = await deploy('D17LaunchFactory', l, [factory, tf, vf, ld]);
  const lockers = await deploy('D17LockerFactory', k, [factory]);
  for (const name of ['D17TokenFactory', 'D17LiquidityVaultFactory', 'D17LaunchDeployer']) pin(name, 'pinLaunchFactory', lf, l);
  pin('D17Factory', 'pinLaunchFactory', lf, f);
  pin('D17Factory', 'pinLockerFactory', lockers, f);
  const result = { schema: 'd17-unsigned-deployment-v1', policy, policySha256: hash(policy), addresses, constructors, transactions,
    warning: 'NO-GO. User signing required. Stop after pinning; verify pre-freeze state before preparing irreversible calls.' };
  return { ...result, planSha256: hash(result) };
}

export function planDigest(plan) { const { planSha256, ...body } = plan; return hash(body); }

// Pin ALL state to one confirmed block, verify every creation/pin receipt, then
// re-read its hash to detect a reorg. Still relies on honest RPC; repeat with a
// separately operated provider before signing and retain both reports.
export async function verifyDeployment({ provider, plan, artifacts, builds, receipts, phase = 'pre-freeze', blockNumber }) {
  assert.ok(['pre-freeze', 'freezing', 'frozen'].includes(phase), 'VERIFICATION_PHASE');
  const recordedFreezes = Object.keys(receipts.freezeTransactions || {});
  assert.ok(recordedFreezes.every(n => FREEZE_ORDER.includes(n)), 'UNKNOWN_FREEZE_RECEIPT');
  if (phase === 'freezing') {
    assert.ok(recordedFreezes.length > 0 && recordedFreezes.length < FREEZE_ORDER.length, 'PARTIAL_FREEZE_REQUIRED');
    assert.ok(FREEZE_ORDER.slice(0, recordedFreezes.length).every(n => recordedFreezes.includes(n)), 'FREEZE_ORDER');
  }
  const frozenContracts = phase === 'frozen' ? FREEZE_ORDER : phase === 'freezing' ? FREEZE_ORDER.slice(0, recordedFreezes.length) : [];
  const rebuilt = await prepareDeployment(plan.policy, artifacts);
  assert.equal(plan.planSha256, planDigest(plan), 'PLAN_DIGEST');
  assert.equal(plan.planSha256, rebuilt.planSha256, 'PLAN_NOT_REPRODUCIBLE');
  const p = plan.policy, a = plan.addresses;
  const chainId = Number(BigInt(await provider.send('eth_chainId', [])));
  assert.equal(chainId, p.chainId, 'RPC_CHAIN_ID');
  const latest = Number(BigInt(await provider.send('eth_blockNumber', [])));
  const height = blockNumber ?? latest - p.confirmations + 1;
  assert.ok(Number.isSafeInteger(height) && height >= 0 && height <= latest - p.confirmations + 1, 'UNCONFIRMED_BLOCK');
  const blockTag = ethers.toQuantity(height);
  const block = await provider.send('eth_getBlockByNumber', [blockTag, false]);
  assert.ok(block?.hash, 'BLOCK_NOT_FOUND');
  const checks = [], runtimeProofs = [], receiptProofs = [];
  const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) });
  const code = addr => provider.send('eth_getCode', [addr, blockTag]);
  const view = async (name, fn, args = []) => new ethers.Contract(a[name], artifacts[name].abi, provider)[fn](...args, { blockTag });
  const isAddress = async (name, fn, expected) => check(`${name}.${fn}`, same(await view(name, fn), expected));
  const immutableValues = {
    D17FeeSplitter: { weth: p.dependencies.weth.address }, D17FeeConfig: {},
    D17Factory: { weth: p.dependencies.weth.address, router: p.dependencies.router.address, feeConfig: a.D17FeeConfig },
    D17TokenFactory: {}, D17LiquidityVaultFactory: {}, D17LaunchDeployer: {},
    D17LaunchFactory: { d17Factory: a.D17Factory, tokenFactory: a.D17TokenFactory, liquidityVaultFactory: a.D17LiquidityVaultFactory, launchDeployer: a.D17LaunchDeployer },
    D17LockerFactory: { d17Factory: a.D17Factory },
  };
  for (const name of SUITE_NAMES) {
    const proof = compareRuntimeBytecode(artifacts[name], builds[name], immutableValues[name], await code(a[name]));
    runtimeProofs.push({ address: a[name], ...proof }); check(`${name} exact runtime`, proof.matches);
  }
  for (const [name, dep] of Object.entries(p.dependencies)) {
    const bytes = await code(dep.address);
    check(`${name} reviewed dependency code`, bytes !== '0x' && ethers.keccak256(bytes) === dep.runtimeKeccak256);
  }
  const routerFactory = await new ethers.Contract(p.dependencies.router.address, ['function factory() view returns(address)'], provider).factory({ blockTag });
  check('router canonical factory link', same(routerFactory, p.dependencies.routerFactory.address));
  // Mainnet deployers must be EOAs for CREATE/nonce prediction. A Safe can own FeeConfig.
  for (const from of new Set([p.factoryDeployer, p.launchDeployer, p.lockerDeployer])) check('deployment actor has no code', await code(from) === '0x', from);
  if (chainId !== 31337) check('fee owner is a contract; Safe owners/threshold require separate review', await code(p.feeConfigOwner) !== '0x');
  for (const name of ['D17Factory', 'D17TokenFactory', 'D17LiquidityVaultFactory', 'D17LaunchDeployer']) {
    await isAddress(name, 'owner', frozenContracts.includes(name) ? ethers.ZeroAddress : name === 'D17Factory' ? p.factoryDeployer : p.launchDeployer);
    check(`${name} launchFactoryPinned`, await view(name, 'launchFactoryPinned'));
    await isAddress(name, 'launchFactory', a.D17LaunchFactory);
  }
  check('D17Factory lockerFactoryPinned', await view('D17Factory', 'lockerFactoryPinned'));
  await isAddress('D17Factory', 'lockerFactory', a.D17LockerFactory);
  for (const [fn, expected] of Object.entries(immutableValues.D17Factory)) await isAddress('D17Factory', fn, expected);
  for (const [fn, expected] of Object.entries(immutableValues.D17LaunchFactory)) await isAddress('D17LaunchFactory', fn, expected);
  await isAddress('D17LockerFactory', 'd17Factory', a.D17Factory);
  await isAddress('D17FeeConfig', 'owner', frozenContracts.includes('D17FeeConfig') ? ethers.ZeroAddress : p.feeConfigOwner);
  await isAddress('D17FeeConfig', 'pendingOwner', ethers.ZeroAddress);
  const [recipient, rate] = await view('D17FeeConfig', 'currentFee');
  check('fixed 2% fee', rate === 200n); check('fee pays exact splitter', same(recipient, a.D17FeeSplitter));
  const [recipients, shares] = await view('D17FeeSplitter', 'recipients');
  check('four reviewed ordered recipients', recipients.length === 4 && recipients.every((r, i) => same(r, p.feeSplitRecipients[i])));
  check('50/12.5/12.5/25 fee allocation', shares.map(Number).join() === '5000,1250,1250,2500');

  const expectedTransactions = [...plan.transactions];
  if (frozenContracts.length) {
    const event = new ethers.Interface(['event OwnershipTransferred(address indexed previousOwner,address indexed newOwner)']);
    const selector = new ethers.Interface(['function renounceOwnership()']).encodeFunctionData('renounceOwnership');
    for (const name of frozenContracts) {
      const txHash = receipts.freezeTransactions?.[name];
      if (!/^0x[a-fA-F0-9]{64}$/.test(txHash || '')) { check(`freeze receipt:${name}`, false, 'MISSING_TX_HASH'); continue; }
      const [tx, r] = await Promise.all([provider.send('eth_getTransactionByHash', [txHash]), provider.send('eth_getTransactionReceipt', [txHash])]);
      const owner = name === 'D17FeeConfig' ? p.feeConfigOwner : name === 'D17Factory' ? p.factoryDeployer : p.launchDeployer;
      const ownerIsContract = await code(owner) !== '0x';
      const emitted = r?.logs.some(log => {
        if (!same(log.address, a[name])) return false;
        try { const parsed = event.parseLog(log); return parsed?.name === 'OwnershipTransferred' && same(parsed.args.previousOwner, owner) && same(parsed.args.newOwner, ethers.ZeroAddress); } catch { return false; }
      });
      const canonical = r && await provider.send('eth_getBlockByNumber', [r.blockNumber, false]);
      check(`freeze receipt:${name}`, Boolean(tx && r && r.status === '0x1' && emitted &&
        canonical?.hash === r.blockHash && tx.blockHash === r.blockHash && Number(BigInt(r.blockNumber)) <= height &&
        Number(BigInt(tx.chainId)) === chainId &&
        (ownerIsContract ? same(tx.to, owner) : same(tx.from, owner) && same(tx.to, a[name]) && tx.input === selector && BigInt(tx.value) === 0n)));
      // A matching inner OwnershipTransferred event proves the Safe executed the
      // call. It does not certify the Safe's threshold, owners, modules or policy.
      if (r) receiptProofs.push({ id: `freeze:${name}`, hash: txHash, blockNumber: Number(BigInt(r.blockNumber)), blockHash: r.blockHash, status: r.status });
    }
  }
  for (const expected of expectedTransactions) {
    const txHash = receipts.transactions?.[expected.id];
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash || '')) { check(`receipt:${expected.id}`, false, 'MISSING_TX_HASH'); continue; }
    const [tx, receipt] = await Promise.all([provider.send('eth_getTransactionByHash', [txHash]), provider.send('eth_getTransactionReceipt', [txHash])]);
    const ok = Boolean(tx && receipt && receipt.status === '0x1' && tx.hash.toLowerCase() === txHash.toLowerCase() &&
      receipt.transactionHash.toLowerCase() === txHash.toLowerCase() && tx.blockHash === receipt.blockHash &&
      Number(BigInt(receipt.blockNumber)) <= height && Number(BigInt(tx.chainId)) === chainId &&
      same(tx.from, expected.from) && Number(BigInt(tx.nonce)) === expected.nonce && BigInt(tx.value) === 0n &&
      tx.input.toLowerCase() === expected.data.toLowerCase() &&
      (expected.kind === 'create' ? tx.to === null && same(receipt.contractAddress, expected.creates) : same(tx.to, expected.to)));
    check(`receipt:${expected.id}`, ok);
    if (receipt) {
      const canonical = await provider.send('eth_getBlockByNumber', [receipt.blockNumber, false]);
      check(`receipt canonical:${expected.id}`, canonical?.hash === receipt.blockHash);
      receiptProofs.push({ id: expected.id, hash: txHash, blockNumber: Number(BigInt(receipt.blockNumber)), blockHash: receipt.blockHash, status: receipt.status });
    }
  }
  const after = await provider.send('eth_getBlockByNumber', [blockTag, false]);
  check('verification block unchanged', after?.hash === block.hash);
  return { schema: 'd17-block-pinned-verification-v1', createdAt: new Date().toISOString(), phase, chainId,
    blockNumber: height, blockHash: block.hash, confirmations: latest - height + 1, frozenContracts,
    sourceCommit: p.sourceCommit, buildManifestSha256: p.buildManifestSha256, planSha256: plan.planSha256,
    ok: checks.every(x => x.ok), checks, runtimeProofs, receiptProofs, mainnetDecision: 'NO-GO',
    limitations: ['RPC truth is not independently attested', 'Independent audit and recipient ownership/Safe configuration review remain separate gates', 'A report is a snapshot; reverify immediately before each irreversible signature'] };
}

// Call only with a freshly produced successful pre-freeze verification in the same
// process. This does not create a Safe transaction, sign, or broadcast anything.
export function prepareFreeze(plan, report) {
  assert.equal(planDigest(plan), plan.planSha256, 'PLAN_DIGEST');
  assert.ok(report.ok && ['pre-freeze', 'freezing'].includes(report.phase) && report.planSha256 === plan.planSha256, 'PRE_FREEZE_PROOF_REQUIRED');
  assert.equal(report.chainId, plan.policy.chainId, 'PROOF_CHAIN_ID');
  const data = new ethers.Interface(['function renounceOwnership()']).encodeFunctionData('renounceOwnership');
  const p = plan.policy;
  const calls = FREEZE_ORDER.filter(name => !(report.frozenContracts || []).includes(name)).map(name => ({
    contract: name, chainId: p.chainId, from: name === 'D17FeeConfig' ? p.feeConfigOwner : name === 'D17Factory' ? p.factoryDeployer : p.launchDeployer,
    to: plan.addresses[name], value: '0', data, irreversible: true,
  }));
  return { schema: 'd17-unsigned-freeze-v1', planSha256: plan.planSha256, verificationBlock: report.blockNumber,
    verificationBlockHash: report.blockHash, calls, mainnetDecision: 'NO-GO',
    warning: 'User approval/signatures required. FeeConfig first; Factory last. Reverify after every signature. Do not import blindly into a wallet.' };
}

export { hash as manifestSha256 };
