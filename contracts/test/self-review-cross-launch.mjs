// Independent multi-launch escrow/accounting model, not copied from contract storage.
// Three concurrent launches, shared Lockers, real Uniswap V2 Factory/Pair bytecode.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {ethers} from 'ethers';
import {eth,now,setTime,startNode,waitForRpc,wait} from './helpers.mjs';
import {suite,v2Artifact} from './release-fixture.mjs';
const report={seed:20261101,checks:0,actions:0,failures:[],scenarios:[],limits:'Local EDR with fixture WETH and real npm-pinned V2 pair; not a mainnet fork.'};
const eq=(a,b,label)=>{assert.equal(a,b,label);report.checks++;};
const reject=async(fn,reason)=>{await assert.rejects(fn,new RegExp(reason));report.checks++;};
const tx=async promise=>{await wait(await promise);report.actions++;};
let rng=20261101;const rnd=n=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng%n;};
const child=startNode(9952);let p;
try{
 p=await waitForRpc(9952,child);const s=await suite(p);const ks=[];
 // Fixture predicts CREATE via staticCall: serialize the shared factory nonce.
 for(let i=0;i<7;i++)ks.push(await s.locker(i));
 const start=(await now(p))+180;
 const ls=[];
 for(let i=0;i<3;i++)ls.push(await s.launch({startTime:start,minPhase1Weth:i===2?eth('100'):eth('0.001'),treasuryBps:i===0?0:1000,roundSharesBps:[1,2499,2500,2500,2500]}));
 const ms=ls.map(()=>ks.map(()=>({paid:Array(5).fill(0n),refunded:Array(5).fill(false),penalty:0n,returned:0n,unlocked:0n,withdrawn:0n,contributed:0n,settled:false})));
 const donations=ks.map(()=>0n);const net=(gross,j)=>gross-gross*BigInt(ls[j].cfg.treasuryBps)/10000n-gross*200n/10000n;
 const sum=a=>a.reduce((x,y)=>x+y,0n);
 const physical=async()=>{
  for(let i=0;i<ks.length;i++){
   const due=sum(ms.map(m=>(m[i].settled?0n:sum(m[i].paid))+m[i].unlocked));
   eq(await ks[i].accountedWeth(),due,'aggregate liability across concurrent launches');
   eq(await s.weth.balanceOf(await ks[i].getAddress()),due+donations[i],'physical escrow equals liability plus donations');
   eq(await ks[i].withdrawableWeth(),sum(ms.map(m=>m[i].unlocked)),'aggregate unlocked rights');
  }
 };
 const reconcile=async j=>{
  for(let r=0;r<5;r++)eq(await ls[j].launch.roundRaised(r),sum(ms[j].map(m=>m.paid[r])),'round total matches external model');
  eq(await ls[j].launch.exactCommittedLiquidityWeth(),sum(ms[j].map(m=>net(sum(m.paid),j))),'per-owner fee rounding');
  eq(await ls[j].launch.retainedPenaltyWeth(),sum(ms[j].map(m=>m.penalty-m.returned)),'remaining penalties');
  await physical();
 };
 for(let r=0;r<5;r++){
  await setTime(p,Number(await ls[0].launch.roundStart(r)));
  for(let j=0;j<(r===0?3:2);j++){
   for(let i=0;i<ks.length;i++){
    for(let top=0;top<(rnd(2)+1);top++){
     const v=eth('0.001')+BigInt(rnd(1000000))*100000001n+BigInt(rnd(1000));
     await tx(ks[i].commitToRound(ls[j].address,r,ls[j].rules,{value:v}));
     ms[j][i].paid[r]+=v;ms[j][i].contributed+=v;
    }
   }
   await reconcile(j);
  }
  if(r===4)break;
  await setTime(p,Number(await ls[0].launch.roundEnd(r)));
  for(let j=0;j<(r===0?3:2);j++){
   for(let i=0;i<ks.length;i++)if((i+r+j)%3===0){
    const m=ms[j][i],gross=m.paid[r],penalty=gross*BigInt(r<2?100:ls[j].cfg.refundPenaltyBps)/10000n;
    await tx(ks[i].refundCurrentRound(ls[j].address));m.paid[r]=0n;m.penalty+=penalty;m.refunded[r]=true;m.unlocked+=gross-penalty;
    if((i+j)%2===0){const v=m.unlocked/2n;await tx(ks[i].withdrawUnlockedWeth(ls[j].address,v));m.unlocked-=v;m.withdrawn+=v;}
    await reject(()=>ks[i].refundCurrentRound.staticCall(ls[j].address),'ROUND_REFUNDED');
   }
   await reconcile(j);
  }
  if(r===0){
   // Donation is recoverable only as excess; other launches' escrow is protected.
   const donation=123456789n;await tx(s.weth.deposit({value:donation}));await tx(s.weth.transfer(await ks[0].getAddress(),donation));donations[0]+=donation;
   await reject(()=>ks[0].recoverExcessWeth.staticCall(s.treasury,donation+1n),'EXCESS_WETH_BALANCE');
   await tx(ks[0].recoverExcessWeth(s.treasury,donation));donations[0]=0n;
   await setTime(p,Number(await ls[0].launch.roundClaimTime(0)));
   eq(await ls[2].launch.launchFailed(),true,'only third launch fails');
   for(let i=0;i<ks.length;i++){
    const m=ms[2][i],due=sum(m.paid)+m.penalty;
    eq(await ks[i].failedRefundDue(ls[2].address),due,'failed entitlement independent of other positions');
    await tx(ks[i].refundFailedLaunch(ls[2].address,ls[2].rules));m.paid.fill(0n);m.returned=m.penalty;m.unlocked+=due;
    await reject(()=>ks[i].refundFailedLaunch.staticCall(ls[2].address,ls[2].rules),'NO_POSITION');
    await tx(ks[i].withdrawUnlockedWeth(ls[2].address,m.unlocked));m.withdrawn+=m.unlocked;m.unlocked=0n;
    eq(m.withdrawn,m.contributed,'failed owner gets 100 percent once');
    await reconcile(2);
   }
   eq(await s.weth.balanceOf(await ls[2].vault.getAddress()),0n,'failed vault completely refunded');
   report.scenarios.push('failed R1 full refunds and partial earlier withdrawals while other launches remain escrowed');
  }
 }
 await setTime(p,Number(await ls[0].launch.roundEnd(4)));
 for(let j=0;j<2;j++){
  const cfg=ls[j].cfg,raised=Array.from({length:5},(_,r)=>sum(ms[j].map(m=>m.paid[r])));
  const alloc=cfg.roundSharesBps.map(x=>cfg.saleTokens*BigInt(x)/10000n),anchor=raised[0]*eth('1')/alloc[0];
  const sold=[alloc[0]];let rollover=0n;
  for(let r=1;r<4;r++){const target=alloc[r]*anchor/eth('1');sold[r]=raised[r]>=target?alloc[r]:alloc[r]*raised[r]/target;rollover+=alloc[r]-sold[r];}
  alloc[4]+=rollover;const target=alloc[4]*anchor/eth('1');sold[4]=raised[4]>=target?alloc[4]:alloc[4]*raised[4]/target;
  await tx(ls[j].launch.finalizeLaunch());eq(await ls[j].launch.finalRoundTokenPool(),alloc[4],'independent final rollover oracle');
  const effective=cfg.lpTokens*sum(sold)/cfg.saleTokens;
  eq(await ls[j].launch.effectiveLpTokens(),effective,'independent scaled LP oracle');
  eq(await ls[j].launch.unsoldSaleTokensSettled(),cfg.saleTokens-sum(sold),'independent unsold burn oracle');
  await setTime(p,Number(await ls[j].launch.poolCreationOpensAt()));
  for(const i of [6,0,5,1,4,2,3]){
   const expected=sum(sold.map((v,r)=>raised[r]?v*ms[j][i].paid[r]/raised[r]:0n));
   await tx(ks[i].connect(s.signer).settleAfterGrace(ls[j].address));ms[j][i].settled=true;
   eq((await ks[i].positions(ls[j].address)).withdrawableTokens,expected,'independent pro-rata oracle');
   await physical();
  }
  const expectedWeth=sum(ms[j].map(m=>net(sum(m.paid),j)+m.penalty));
  await reject(async()=>ls[j].vault.createOfficialPool.staticCall(2n**256n-1n,(await now(p))+600),'LP_SLIPPAGE');
  eq(await ls[j].launch.vaultLiquidityClaimed(),false,'failed pool attempt rolls back launch claim');
  // Unsolicited WETH directly to a synced empty real V2 pair is not a blocker.
  await tx(s.v2.createPair(await ls[j].token.getAddress(),await s.weth.getAddress()));
  const pair=new ethers.Contract(await s.v2.getPair(await ls[j].token.getAddress(),await s.weth.getAddress()),v2Artifact('UniswapV2Pair').abi,s.signer);
  await tx(s.weth.deposit({value:eth('0.1')}));await tx(s.weth.transfer(await pair.getAddress(),eth('0.1')));await tx(pair.sync());
  await tx(ls[j].vault.createOfficialPool(0,(await now(p))+600));
  eq(await ls[j].vault.wethUsedForPool(),expectedWeth,'exact protocol WETH used despite donation');
  eq(await ls[j].token.balanceOf(await pair.getAddress()),effective,'exact protocol token pool funding');
  eq(await s.weth.balanceOf(await pair.getAddress()),expectedWeth+eth('0.1'),'donated reserve retained in pool');
  await reject(async()=>ls[j].vault.recoverUnsupportedTokenToTreasury.staticCall(await pair.getAddress(),1),'LP_PROTECTED');
  report.scenarios.push(`success ${j}: five-round model, shuffled permissionless settlement, reverted pool rollback, synced WETH preseed, LP protection`);
 }
 report.status='PASS';
}catch(e){report.status='FAIL';report.error=String(e.stack);throw e;}
finally{await p?.destroy();await child.kill();mkdirSync('runs/self-review',{recursive:true});writeFileSync('runs/self-review/cross-launch.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
