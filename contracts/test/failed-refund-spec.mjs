// M-20261031-012: characterize existing behavior, NOT approval of the policy.
// All execution uses local in-process EDR. No external RPC or wallet.
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {compile, eth, setTime, startNode, wait, waitForRpc} from './helpers.mjs';
import {suite, BURN} from './release-fixture.mjs';

const report = {scope:'V15.1 current-code/spec mismatch witness, not remediation', checks:0, scenarios:[]};
const eq = (actual, expected, label) => {assert.equal(actual, expected, label);report.checks++;};
const rejects = async (action, reason) => {await assert.rejects(action, new RegExp(reason));report.checks++;};
compile();
const child = startNode(9931);
let provider;
try {
  provider = await waitForRpc(9931, child);
  const s = await suite(provider);
  const a = await s.locker(0), b = await s.locker(1);
  const ownerA = await a.owner(), ownerB = await b.owner();
  const outsider = await provider.getSigner(10);

  // Exact manager example: threshold 10, A=1/B=9; A voluntarily exits first.
  const l = await s.launch({minPhase1Weth:eth('10')});
  await setTime(provider, Number(await l.launch.roundStart(0))+1);
  await wait(await a.commitToRound(l.address,0,l.rules,{value:eth('1')}));
  await wait(await b.commitToRound(l.address,0,l.rules,{value:eth('9')}));
  eq(await l.launch.anchorReady(),true,'10 ETH meets anchor before voluntary exit');
  await setTime(provider, Number(await l.launch.roundEnd(0))+1);
  await wait(await a.refundCurrentRound(l.address));
  eq(await l.launch.roundRaised(0),eth('9'),'retained R1 below threshold');
  eq((await a.positions(l.address)).residualWeth,eth('0.99'),'A net refund unlocked');
  eq((await a.positions(l.address)).penaltyPaid,eth('0.01'),'A penalty attributed');
  eq(await s.weth.balanceOf(await l.vault.getAddress()),eth('0.01'),'penalty already in vault');
  const aBefore = await s.weth.balanceOf(ownerA);
  await wait(await a.withdrawUnlockedWeth(l.address,eth('0.99')));
  eq(await s.weth.balanceOf(ownerA)-aBefore,eth('0.99'),'A can withdraw before failure');
  eq((await a.positions(l.address)).residualWeth,0n,'A net refund withdrawn exactly once');
  await rejects(()=>a.withdrawUnlockedWeth.staticCall(l.address,1n),'POSITION_WETH_BALANCE');
  await rejects(()=>l.vault.burnFailedLaunchPenalties.staticCall(),'LAUNCH_NOT_FAILED');

  await setTime(provider,Number(await l.launch.roundEnd(0))+Number(await l.launch.refundSeconds())+1);
  eq(await l.launch.launchFailed(),true,'failure after R1 refund window');
  await rejects(()=>a.refundFailedLaunch.staticCall(l.address,l.rules),'NO_POSITION');
  await wait(await b.refundFailedLaunch(l.address,l.rules));
  eq((await b.positions(l.address)).residualWeth,eth('9'),'B principal fully unlocked');
  eq((await b.positions(l.address)).penaltyPaid,0n,'failure adds no B penalty');
  const bBefore=await s.weth.balanceOf(ownerB);
  await wait(await b.withdrawUnlockedWeth(l.address,eth('9')));
  eq(await s.weth.balanceOf(ownerB)-bBefore,eth('9'),'B receives full WETH principal');
  await rejects(()=>b.refundFailedLaunch.staticCall(l.address,l.rules),'NO_POSITION');
  eq(await s.weth.balanceOf(await s.splitter.getAddress()),0n,'no protocol fee');
  eq(await s.weth.balanceOf(s.treasury),0n,'no treasury payment');
  const deadBefore=await s.weth.balanceOf(BURN);
  eq(await s.weth.balanceOf(await l.vault.getAddress()),eth('0.01'),'failure does not automatically send penalty');
  await wait(await l.vault.connect(outsider).burnFailedLaunchPenalties());
  eq(await s.weth.balanceOf(BURN)-deadBefore,eth('0.01'),'permissionless call sends prior penalty to dead');
  eq(await s.weth.balanceOf(await l.vault.getAddress()),0n,'vault emptied');
  eq(await l.vault.failedLaunchPenaltyWethBurned(),eth('0.01'),'dead-transfer accounting');
  await rejects(()=>l.vault.burnFailedLaunchPenalties.staticCall(),'NO_WETH');
  eq(await a.accountedWeth(),0n,'A escrow reconciled');
  eq(await b.accountedWeth(),0n,'B escrow reconciled');
  eq(eth('0.99')+eth('9')+eth('0.01'),eth('10'),'all contributed WETH accounted');
  report.scenarios.push({name:'voluntary-exit-then-failure',A_committed:'1',A_received:'0.99',B_committed:'9',B_received:'9',dead_received:'0.01',automatic_dead_transfer:false,fee:'0',treasury:'0'});

  // Control: failure without voluntary refund does not create a penalty.
  const control=await s.launch({minPhase1Weth:eth('10')});
  await setTime(provider,Number(await control.launch.roundStart(0))+1);
  await wait(await b.commitToRound(control.address,0,control.rules,{value:eth('9')}));
  await setTime(provider,Number(await control.launch.roundEnd(0))+Number(await control.launch.refundSeconds())+1);
  eq(await control.launch.launchFailed(),true,'under-threshold control fails');
  await wait(await b.refundFailedLaunch(control.address,control.rules));
  eq((await b.positions(control.address)).residualWeth,eth('9'),'control full principal unlocked');
  eq((await b.positions(control.address)).penaltyPaid,0n,'control no penalty');
  await wait(await b.withdrawUnlockedWeth(control.address,eth('9')));
  eq(await s.weth.balanceOf(await control.vault.getAddress()),0n,'control vault empty');
  await rejects(()=>control.vault.burnFailedLaunchPenalties.staticCall(),'NO_WETH');
  eq(await s.weth.balanceOf(BURN)-deadBefore,eth('0.01'),'control sends no extra WETH to dead');
  report.scenarios.push({name:'failure-without-voluntary-refund',committed:'9',refunded:'9',new_penalty:'0',dead_received:'0'});
  report.status='PASS: existing behavior reproduced; ND-003 unresolved';
} finally {
  await provider?.destroy();
  await child.kill();
  mkdirSync('../evidence/failed-refund-spec-2026-10-31',{recursive:true});
  writeFileSync('../evidence/failed-refund-spec-2026-10-31/result.json',JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report,null,2));
