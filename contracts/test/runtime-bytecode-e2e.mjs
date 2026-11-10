import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ethers } from 'ethers';
import { artifact, compile, root, startNode, waitForRpc } from './helpers.mjs';
import { suite } from './release-fixture.mjs';
import { compareRuntimeBytecode, expectedRuntimeBytecode, validateFeePolicy } from '../scripts/runtime-bytecode.mjs';

const report = { schema: 'd17-runtime-proof-tests-v1', checks: 0, runtimeProofs: [], status: 'running' };
const check = (value, message) => { report.checks++; assert.ok(value, message); };
const throws = (fn, reason) => { assert.throws(fn, reason); report.checks++; };
compile();
const child = startNode(9915); let p;
try {
  p = await waitForRpc(9915, child);
  const s = await suite(p);
  const factory = await s.factory.getAddress();
  const weth = await s.weth.getAddress();
  const router = await s.router.getAddress();
  const feeConfig = await s.feeConfig.getAddress();
  const lfAddress = await s.factory.launchFactory();
  const lf = new ethers.Contract(lfAddress, artifact('D17LaunchFactory.sol','D17LaunchFactory').abi, s.signer);
  const tokenFactory = await lf.tokenFactory();
  const liquidityVaultFactory = await lf.liquidityVaultFactory();
  const launchDeployer = await lf.launchDeployer();
  const cases = [
    ['D17Factory', factory, { weth, router, feeConfig }],
    ['D17FeeConfig', feeConfig, {}],
    ['D17FeeSplitter', await s.splitter.getAddress(), { weth }],
    ['D17TokenFactory', tokenFactory, {}],
    ['D17LiquidityVaultFactory', liquidityVaultFactory, {}],
    ['D17LaunchDeployer', launchDeployer, {}],
    ['D17LaunchFactory', lfAddress, { d17Factory: factory, tokenFactory, liquidityVaultFactory, launchDeployer }],
    ['D17LockerFactory', await s.lockerFactory.getAddress(), { d17Factory: factory }],
  ];
  for (const [name, address, values] of cases) {
    const art = artifact(`${name}.sol`, name);
    const build = JSON.parse(readFileSync(path.join(root, 'artifacts/build-info', `${art.buildInfoId}.output.json`), 'utf8'));
    const code = await p.getCode(address);
    const proof = compareRuntimeBytecode(art, build, values, code);
    check(proof.matches, `${name} actual EVM runtime matches all immutable values`);
    report.runtimeProofs.push({ address, ...proof });
    const bytes = ethers.getBytes(code); bytes[0] ^= 1;
    check(!compareRuntimeBytecode(art, build, values, ethers.hexlify(bytes)).matches, 'single opcode mutation rejected');
    check(!compareRuntimeBytecode(art, build, values, '0x').matches, 'no code rejected');
    check(!compareRuntimeBytecode(art, build, values, code.slice(0, -2)).matches, 'truncated runtime rejected');
    throws(() => expectedRuntimeBytecode(art, { ...build, id: 'wrong-build' }, values), /BUILD_INFO_ID_MISMATCH/);
    throws(() => expectedRuntimeBytecode(art, build, { ...values, unknown: ethers.ZeroAddress }), /UNEXPECTED_IMMUTABLE_VALUES/);
    if (Object.keys(values).length) {
      const key = Object.keys(values)[0];
      check(!compareRuntimeBytecode(art, build, { ...values, [key]: ethers.ZeroAddress }, code).matches, 'wrong immutable dependency rejected');
      const missing = { ...values }; delete missing[key];
      throws(() => expectedRuntimeBytecode(art, build, missing), /MISSING_IMMUTABLE/);
    }
  }
  // These are EDR fixture addresses only, never production recipient defaults.
  const policy = { schema: 'd17-reviewed-fee-policy-v1', chainId: 31337, protocolFeeBps: 200, feeSplitBps: [5000,1250,1250,2500], feeSplitRecipients: s.recipients };
  check(validateFeePolicy(policy, 31337).feeSplitRecipients.length === 4, 'valid fixture policy accepted');
  throws(() => validateFeePolicy(policy, 1), /POLICY_CHAIN_ID/);
  throws(() => validateFeePolicy({ ...policy, feeSplitRecipients: [] }, 31337), /POLICY_FOUR_RECIPIENTS/);
  throws(() => validateFeePolicy({ ...policy, feeSplitRecipients: [ethers.ZeroAddress, ...s.recipients.slice(1)] }, 31337), /POLICY_ZERO_RECIPIENT/);
  throws(() => validateFeePolicy({ ...policy, feeSplitRecipients: Array(4).fill(s.recipients[0]) }, 31337), /POLICY_DUPLICATE_RECIPIENT/);
  throws(() => validateFeePolicy({ ...policy, feeSplitBps: [2500,2500,2500,2500] }, 31337), /POLICY_SHARES/);
  throws(() => validateFeePolicy({ ...policy, protocolFeeBps: 199 }, 31337), /POLICY_FEE_NOT_200/);
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = String(error.stack); throw error; }
finally {
  mkdirSync('runs/security', { recursive: true });
  writeFileSync('runs/security/runtime-bytecode.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2)); p?.destroy(); await child.kill('SIGTERM');
}
