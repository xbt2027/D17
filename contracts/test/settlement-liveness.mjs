// Additional D-002 evidence. In-process EDR only; no live RPC or signing keys.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ethers } from 'ethers';
import solc from 'solc';
import { compile, eth, now, setTime, startNode, wait, waitForRpc } from './helpers.mjs';
import { suite, net, BURN, v2Artifact } from './release-fixture.mjs';

const report = { schema: 'd17-d002-cloud-liveness-v1', evm: 'Hardhat EDR', realUniswapV2: true, lockers: 256, rounds: 5, checks: 0, transactions: 0, batchGas: [] };
const check = (ok, label) => { report.checks++; assert.ok(ok, label); };
const tx = async p => { const receipt = await wait(await p); report.transactions++; return receipt; };
const rejects = async (fn, reason) => { await assert.rejects(fn, reason); report.checks++; };
compile();
const child = startNode(9914);
let p;
try {
  p = await waitForRpc(9914, child);
  const s = await suite(p);
  const ks = [];
  for (let i = 0; i < 255; i++) ks.push(await s.locker(i));
  // A real contract owner becomes unusable after funding and rejects native transfers.
  // Permissionless settlement must not execute any code on this owner.
  const input = { language: 'Solidity', sources: { 'UnavailableOwner.sol': { content: `
    pragma solidity ^0.8.24;
    interface F { function createLockerFor(address owner) external returns(address); }
    interface K { function commitToRound(address launch,uint8 round,bytes32 rules) external payable; }
    contract UnavailableOwner {
      address public locker; bool public stopped;
      function create(address factory) external { require(locker==address(0)); locker=F(factory).createLockerFor(address(this)); }
      function fund(address launch,uint8 round,bytes32 rules) external payable { require(!stopped,"OWNER_OFFLINE"); K(locker).commitToRound{value:msg.value}(launch,round,rules); }
      function stop() external { stopped=true; }
      receive() external payable { revert("OWNER_REJECTS_CALLBACK"); }
    }` } }, settings: { viaIR: true, optimizer: { enabled: true, runs: 1 }, evmVersion: 'shanghai', metadata: { bytecodeHash: 'none' }, outputSelection: { '*': { '*': ['abi','evm.bytecode.object'] } } } };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  assert.equal((output.errors || []).filter(x => x.severity === 'error').length, 0);
  const art = output.contracts['UnavailableOwner.sol'].UnavailableOwner;
  const owner = await new ethers.ContractFactory(art.abi, art.evm.bytecode.object, s.signer).deploy();
  await owner.waitForDeployment();
  await tx(owner.create(await s.lockerFactory.getAddress()));
  const offline = ks[0].attach(await owner.locker()).connect(s.signer);
  ks.push(offline);
  const empty = await s.locker(300);
  const l = await s.launch();
  const gross = Array(256).fill(0n);
  for (let round = 0; round < 5; round++) {
    await setTime(p, Number(await l.launch.roundStart(round)) + 1);
    for (let i = 0; i < 256; i++) {
      const value = eth('0.001') + BigInt((i * 17 + round * 31) % 997);
      if (i === 255) await tx(owner.fund(l.address, round, l.rules, { value }));
      else await tx(ks[i].commitToRound(l.address, round, l.rules, { value }));
      gross[i] += value;
    }
  }
  await tx(owner.stop());
  await rejects(() => owner.fund.staticCall(l.address, 4, l.rules, { value: eth('0.001') }), /OWNER_OFFLINE/);
  await rejects(() => s.signer.sendTransaction({ to: owner.getAddress(), value: 1n }), /OWNER_REJECTS_CALLBACK/);
  await setTime(p, Number(await l.launch.roundEnd(4)) + 1);
  await tx(l.launch.finalizeLaunch());
  const addresses = await Promise.all(ks.map(k => k.getAddress()));
  const rights = await Promise.all(addresses.map(a => l.launch.previewFinalSaleTokens(a)));
  const initial = addresses.slice(0, 8);
  check(await s.lockerFactory.settleAfterGraceBatch.staticCall(l.address, initial, { gasLimit: 9_000_000 }) === 0n, 'pre-grace peers all fail in isolation');
  const pre = await tx(s.lockerFactory.settleAfterGraceBatch(l.address, initial, { gasLimit: 9_000_000 }));
  const events = receipt => receipt.logs.map(x => { try { return s.lockerFactory.interface.parseLog(x); } catch { return null; } }).filter(x => x?.name === 'BatchSettlementResult');
  check(events(pre).length === 8 && events(pre).every(x => !x.args.success), 'eight pre-grace failure events');
  check(await l.launch.allFinalCommitmentsSettled() === false, 'pre-grace failures cannot open pool');
  await setTime(p, Number(await l.launch.poolCreationOpensAt()) + 1);
  await rejects(() => s.lockerFactory.settleAfterGraceBatch.staticCall(l.address, [], { gasLimit: 9_000_000 }), /BATCH_SIZE/);
  await rejects(() => s.lockerFactory.settleAfterGraceBatch.staticCall(l.address, addresses.slice(0, 9), { gasLimit: 12_000_000 }), /BATCH_SIZE/);
  await rejects(() => s.lockerFactory.settleAfterGraceBatch.staticCall(l.address, initial, { gasLimit: 8_300_000 }), /BATCH_GAS/);
  check(!(await ks[0].positions(l.address)).liquiditySettled, 'rejected gas budget leaves settlement untouched');
  const mixed = [addresses[0], await empty.getAddress(), addresses[0], ethers.ZeroAddress, await s.signer.getAddress(), ...addresses.slice(1, 4)];
  check(await s.lockerFactory.settleAfterGraceBatch.staticCall(l.address, mixed, { gasLimit: 9_000_000 }) === 4n, 'mixed batch return count');
  const mixedReceipt = await tx(s.lockerFactory.settleAfterGraceBatch(l.address, mixed, { gasLimit: 9_000_000 }));
  const mixedEvents = events(mixedReceipt);
  check(mixedEvents.length === 8 && mixedEvents.filter(x => x.args.success).length === 4, 'empty canonical, duplicate, zero and unregistered peers isolated');
  check(mixedEvents.every((x, i) => x.args.locker === mixed[i] && x.args.launch === l.address), 'ordered event attribution');
  for (let start = 4; start < 255; start += 8) {
    const group = addresses.slice(start, Math.min(start + 8, 255));
    const receipt = await tx(s.lockerFactory.settleAfterGraceBatch(l.address, group, { gasLimit: 9_000_000 }));
    const e = events(receipt);
    check(e.length === group.length && e.every(x => x.args.success), 'full eight-position batches succeed');
    check(receipt.gasUsed < 9_000_000n, 'batch fits explicit gas budget');
    report.batchGas.push(Number(receipt.gasUsed));
  }
  await rejects(() => l.vault.createOfficialPool.staticCall(0, (2 ** 32) - 1), /UNSETTLED_COMMITMENTS/);
  await setTime(p, (await now(p)) + 365 * 86400);
  const receipt = await tx(offline.settleAfterGrace(l.address));
  report.offlineOwnerDirectSettlementGas = Number(receipt.gasUsed);
  check(await l.launch.allFinalCommitmentsSettled(), 'unavailable smart-account owner does not veto funding');
  for (let i = 0; i < 256; i++) {
    const pos = await ks[i].positions(l.address);
    check(pos.withdrawableTokens === rights[i], 'unchanged per-locker token rights');
    check(pos.wethSentToVault === net(gross[i]), 'wei-exact per-locker liquidity');
    check(await l.token.balanceOf(addresses[i]) === rights[i], 'tokens stay in owner escrow');
  }
  await rejects(() => offline.withdrawUnlockedTokens.staticCall(l.address, 1n), /NOT_OWNER/);
  await tx(l.vault.createOfficialPool(0, (await now(p)) + 600));
  check(await l.vault.wethUsedForPool() === gross.reduce((a, g) => a + net(g), 0n), 'complete initial WETH reserves');
  check(await l.vault.tokenUsedForPool() === await l.launch.effectiveLpTokens(), 'complete LP token allocation');
  check(await s.weth.balanceOf(BURN) === 0n, 'no successful funding burned');
  const pair = new ethers.Contract(await l.vault.officialPair(), v2Artifact('UniswapV2Pair').abi, s.signer);
  check(await pair.balanceOf(await l.vault.getAddress()) === await pair.totalSupply() - 1000n, 'permanent vault LP ownership');
  check(await s.weth.balanceOf(await s.splitter.getAddress()) === gross.reduce((a, g) => a + g * 200n / 10000n, 0n), '2% fee exact');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = String(error.stack); throw error;
} finally {
  mkdirSync('runs/security', { recursive: true });
  writeFileSync('runs/security/settlement-liveness.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  p?.destroy(); await child.kill('SIGTERM');
}
