import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ethers } from 'ethers';
import { compile, eth, now, setTime, startNode, wait, waitForRpc } from './helpers.mjs';
import { suite, config, net, swap, BURN } from './release-fixture.mjs';
const baseline=process.env.RELEASE_BASELINE==='1';
const report={mode:baseline?'baseline-vulnerability-reproduction':'release-regression',scenarios:[],evm:true,realUniswapV2:true};
function check(name,condition,details={}) { assert.ok(condition,name);report.scenarios.push({name,...details}); }
compile(); const child=startNode(9911);let p;
try {
  p=await waitForRpc(9911,child);const s=await suite(p);
  const a=await s.locker(0),b=await s.locker(1),c=await s.locker(2);
  const cap=2n**112n-1n;
  const maximum=config((await now(p))+200,s.treasury,{tokenSupply:cap,saleTokens:cap-eth('50000000'),lpTokens:eth('40000000'),manualDistributionTokens:eth('5000000'),deadTokens:eth('5000000')});
  check('uint112 maximum supply allowed',Boolean(await s.factory.createLaunch.staticCall(maximum)));
  const over={...maximum,tokenSupply:cap+1n,saleTokens:maximum.saleTokens+1n};
  if(baseline)check('BASELINE accepts unpairable supply above uint112',Boolean(await s.factory.createLaunch.staticCall(over)));
  else {await assert.rejects(s.factory.createLaunch.staticCall(over),/SUPPLY_ABOVE_V2_RESERVE/);check('supply above uint112 rejected before funding',true);}
  const l=await s.launch();const L=l.address;
  await setTime(p,l.cfg.startTime+1);
  const amounts=[eth('1')+1n,eth('1')+7n,eth('1')+13n];
  for(const [i,k] of [a,b,c].entries())await wait(await k.commitToRound(L,0,l.rules,{value:amounts[i]}));
  const exact=amounts.reduce((x,y)=>x+net(y),0n),actual=await l.launch.totalLiquidityWeth();
  check(baseline?'BASELINE aggregate rounding differs from locker sum':'exact locker rounding equals total',baseline?actual!==exact:actual===exact,{actual:String(actual),expected:String(exact)});
  await setTime(p,Number(await l.launch.roundEnd(4))+1);await wait(await l.launch.finalizeLaunch());
  for(const k of [a,b,c])await wait(await k.settleAndClaim(L,l.rules));
  await setTime(p,Number(await l.launch.poolCreationOpensAt())+1);
  if(baseline) {await assert.rejects(l.vault.createOfficialPool.staticCall(0,(await now(p))+600));check('BASELINE all-settled pool creation blocked by rounding',true);}
  else {await wait(await l.vault.createOfficialPool(0,(await now(p))+600));check('all-settled real V2 pool opens with exact WETH',await l.vault.wethUsedForPool()===exact);}
  // Equal round entitlements; only one position supplies the initial pool in legacy V15.
  const late=await s.launch({treasuryBps:0}); await setTime(p,late.cfg.startTime+1);
  for(const k of [a,b,c])await wait(await k.commitToRound(late.address,0,late.rules,{value:eth('1')}));
  await setTime(p,Number(await late.launch.roundEnd(4))+1);await wait(await late.launch.finalizeLaunch());
  await wait(await a.settleAndClaim(late.address,late.rules));
  await setTime(p,Number(await late.launch.poolCreationOpensAt())+1);
  if(baseline || process.env.RELEASE_EXPECT_LEGACY_LATE==='1') {
    await wait(await late.vault.createOfficialPool(0,(await now(p))+600));
    const owned=(await a.positions(late.address)).withdrawableTokens;
    await wait(await a.withdrawUnlockedTokens(late.address,owned));
    await swap(s,late,late.token,owned,a.runner);
    const before=await s.weth.balanceOf(BURN);
    await wait(await b.settleAndClaim(late.address,late.rules));
    const lost=await s.weth.balanceOf(BURN)-before;
    check('OPEN P0-C: falling pool price sends late WETH to dead address',lost>0n,{lostWethWei:String(lost)});
  } else {
    await assert.rejects(late.vault.createOfficialPool.staticCall(0,(await now(p))+600),/UNSETTLED_COMMITMENTS/);
    const before=await s.weth.balanceOf(BURN);
    for(const k of [b,c])await wait(await k.connect(s.signer).settleAfterGrace(late.address));
    await wait(await late.vault.createOfficialPool(0,(await now(p))+600));
    check('absent owners permissionlessly settled before pool',await late.launch.allFinalCommitmentsSettled());
    check('complete initial reserves; no late WETH loss',await late.vault.wethUsedForPool()===eth('2.94') && await s.weth.balanceOf(BURN)===before);
    const owned=(await a.positions(late.address)).withdrawableTokens;await wait(await a.withdrawUnlockedTokens(late.address,owned));
    await swap(s,late,late.token,owned,a.runner);
    await assert.rejects(b.settleAndClaim.staticCall(late.address,late.rules),/LIQUIDITY_SETTLED/);
    check('post-swap settlement timing option unavailable',true);
  }
  report.status='passed';
} catch(e) {report.status='failed'; report.error=String(e.stack);throw e;}
finally {mkdirSync('runs/release',{recursive:true});writeFileSync(`runs/release/${baseline?'baseline':'regressions'}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));p?.destroy();child.kill('SIGTERM');}
