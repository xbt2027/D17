import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { verifyDeployment, FREEZE_ORDER } from './release-plan.mjs';

const NETWORKS = { 1: 'mainnet', 11155111: 'sepolia', 31337: 'local' };
const CONTRACT_KEYS = {
  d17Factory: 'D17Factory', feeConfig: 'D17FeeConfig', tokenFactory: 'D17TokenFactory',
  launchDeployer: 'D17LaunchDeployer', launchFactory: 'D17LaunchFactory',
  liquidityVaultFactory: 'D17LiquidityVaultFactory', lockerFactory: 'D17LockerFactory',
};
const EXPLORER_TRANSACTION_KEYS = {
  D17FeeSplitter: 'feeSplitterTransaction', D17FeeConfig: 'feeConfigTransaction',
  D17Factory: 'factoryTransaction', D17TokenFactory: 'tokenFactoryTransaction',
  D17LiquidityVaultFactory: 'liquidityVaultFactoryTransaction', D17LaunchDeployer: 'launchDeployerTransaction',
  D17LaunchFactory: 'launchFactoryTransaction', D17LockerFactory: 'lockerFactoryTransaction',
};

// Read-only staging; saved `ok: true` reports are never accepted as authority.
// The caller supplies the actual clean Git HEAD. RPC operator independence and
// independent audit acceptance remain operational obligations, not hash proofs.
export async function preparePublication({ providers, plan, receipts, artifacts, builds, sourceCommit }) {
  assert.equal(plan.policy.sourceCommit, sourceCommit, 'PUBLICATION_SOURCE_COMMIT');
  const chainId = plan.policy.chainId, network = NETWORKS[chainId];
  assert.ok(network, 'PUBLICATION_NETWORK');
  assert.ok(providers?.length === 2 && providers[0] !== providers[1], 'TWO_RPC_PROVIDERS_REQUIRED');
  const heights = await Promise.all(providers.map(async p => Number(BigInt(await p.send('eth_blockNumber', [])))));
  const height = Math.min(...heights) - plan.policy.confirmations + 1;
  const reports = [];
  for (const provider of providers) {
    const report = await verifyDeployment({ provider, plan, receipts, artifacts, builds, phase: 'frozen', blockNumber: height });
    assert.ok(report.ok && report.frozenContracts.length === FREEZE_ORDER.length, 'FRESH_FROZEN_VERIFICATION_REQUIRED');
    reports.push(report);
  }
  assert.equal(reports[0].blockHash, reports[1].blockHash, 'RPC_BLOCK_DISAGREEMENT');
  const creationIds = plan.transactions.filter(t => t.kind === 'create').map(t => t.id);
  const creationBlocks = reports[0].receiptProofs.filter(r => creationIds.includes(r.id)).map(r => r.blockNumber);
  assert.equal(creationBlocks.length, creationIds.length, 'CREATION_RECEIPTS_REQUIRED');
  const startBlock = Math.min(...creationBlocks);
  assert.ok(Number.isSafeInteger(startBlock) && startBlock >= 0, 'PUBLICATION_START_BLOCK');
  const contracts = Object.fromEntries(Object.entries(CONTRACT_KEYS).map(([key, name]) => [key, ethers.getAddress(plan.addresses[name])]));
  const { policy: p } = plan;
  const manifest = {
    schema: 'd17-public-deployment-v2', chainId, network, protocolVersion: 'V15_1', status: 'deployed',
    startBlock, contracts, weth: p.dependencies.weth.address, router: p.dependencies.router.address,
  };
  const provenance = {
    schema: 'd17-public-deployment-provenance-v3', ...manifest,
    sourceCommit, buildManifestSha256: p.buildManifestSha256, planSha256: plan.planSha256,
    verificationBlock: height, verificationBlockHash: reports[0].blockHash,
    protocolFee: { recipient: plan.addresses.D17FeeSplitter, bps: 200 }, feeConfigOwner: ethers.ZeroAddress,
    feeSplitter: { address: plan.addresses.D17FeeSplitter, recipients: p.feeSplitRecipients, sharesBps: p.feeSplitBps },
    receipts,
    transactions: Object.fromEntries(Object.entries(EXPLORER_TRANSACTION_KEYS).map(([name, key]) => [key, receipts.transactions[`deploy:${name}`]])),
    verificationReports: reports, publicationStatus: 'staged-only', mainnetDecision: 'NO-GO',
    limitations: 'Fresh RPC agreement is not independent audit approval or proof of provider independence. Review and explicit production promotion remain required.',
  };
  return { manifest, provenance };
}
