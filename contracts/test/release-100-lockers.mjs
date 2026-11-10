import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {ethers} from 'ethers';
import {compile,eth,now,setTime,startNode,wait,waitForRpc} from './helpers.mjs';
import {suite,net,BURN,v2Artifact} from './release-fixture.mjs';
const SEED=Number(process.env.RELEASE_SEED||0xd17026);let seed=SEED>>>0;
const rnd=n=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%n;};
const report={seed:SEED,lockers:100,rounds:5,evm:true,realUniswapV2:true,checks:0,actions:0,orders:[]};
const eq=(a,b,label)=>{report.checks++;assert.equal(a,b,label);};
const ok=(v,label)=>{report.checks++;assert.ok(v,label);};
const tx=async t=>{const r=await wait(await t);report.actions++;return r;};
compile();const child=startNode(9912);let p;
try {
 p=await waitForRpc(9912,child);const s=await suite(p),ks=[];for(let i=0;i<100;i++)ks.push(await s.locker(i));
 const l=await s.launch();const ledger=Array.from({length:100},()=>Array(5).fill(0n));const penalties=Array(100).fill(0n);let totalPenalty=0n;
 const gross=i=>ledger[i].reduce((a,b)=>a+b,0n);
 async function invariant(i,label) {
  const total=ledger.reduce((a,_,j)=>a+gross(j),0n),exact=ledger.reduce((a,_,j)=>a+net(gross(j)),0n);
  eq(await l.launch.totalCommittedWeth(),total,label+' gross');
  eq(await l.launch.totalLiquidityWeth(),exact+totalPenalty,label+' net');
  eq(await l.launch.exactCommittedLiquidityWeth(),exact,label+' exact accumulator');
  const state=await ks[i].positions(l.address);
  eq(state.ethCommitted,state.wethCommitted+state.wethRefunded+state.penaltyPaid,label+' participant conservation');
  eq(await s.weth.balanceOf(await ks[i].getAddress()),await ks[i].accountedWeth(),label+' escrow accounting');
 }
 for(let r=0;r<5;r++) {
  await setTime(p,Number(await l.launch.roundStart(r))+1);
  for(let i=0;i<100;i++) {
   const amount=eth('0.001')+BigInt(rnd(1000000));
   await tx(ks[i].commitToRound(l.address,r,l.rules,{value:amount}));ledger[i][r]+=amount;
   if(rnd(4)===0){const top=eth('0.001')+BigInt(rnd(10000));await tx(ks[i].commitToRound(l.address,r,l.rules,{value:top}));ledger[i][r]+=top;}
   await invariant(i,`r${r+1} commit ${i}`);
  }
  if(r<4){
   await setTime(p,Number(await l.launch.roundEnd(r))+1);
   for(let i=0;i<100;i++) if(rnd(5)===0){
    const amount=ledger[i][r],penalty=amount*BigInt(r<2?100:1703)/10000n;
    await tx(ks[i].refundCurrentRound(l.address));ledger[i][r]=0n;totalPenalty+=penalty;penalties[i]+=penalty;
    const refund=amount-penalty;await tx(ks[i].withdrawUnlockedWeth(l.address,refund));
    await invariant(i,`r${r+1} refund ${i}`);
    await assert.rejects(ks[i].refundCurrentRound.staticCall(l.address),/ROUND_REFUNDED/);report.checks++;
   }
  }
 }
 await setTime(p,Number(await l.launch.roundEnd(4))+1);await tx(l.launch.finalizeLaunch());
 const entitlement=await Promise.all(ks.map(k=>l.launch.previewFinalSaleTokens(k.getAddress())));
 const totalGross=ledger.reduce((a,_,i)=>a+gross(i),0n),totalNet=ledger.reduce((a,_,i)=>a+net(gross(i)),0n);
 const totalFee=ledger.reduce((a,_,i)=>a+gross(i)*200n/10000n,0n),totalTreasury=ledger.reduce((a,_,i)=>a+gross(i)*733n/10000n,0n);
 eq(totalGross,totalNet+totalFee+totalTreasury,'WETH split exact to wei');
 eq(await l.launch.finalCommittedWeth(),totalGross,'final gross snapshot');
 const supplyBefore=await l.token.totalSupply(),eff=await l.launch.effectiveLpTokens();
 eq(supplyBefore,l.cfg.tokenSupply-await l.launch.unsoldSaleTokensSettled()-await l.launch.unusedLpTokensBurned(),'burn conservation');
 await setTime(p,Number(await l.launch.poolCreationOpensAt())+1);
 let snapshot=await p.send('evm_snapshot',[]);
 const forward=ks.map((_,i)=>i),reverse=[...forward].reverse(),random=[...forward].sort(()=>rnd(3)-1);
 const outputs=[];
 for(const [name,order] of [['forward',forward],['reverse',reverse],['shuffled',random],['bounded-batches',random]]) {
  if(name!=='forward'){await p.send('evm_revert',[snapshot]);snapshot=await p.send('evm_snapshot',[]);}
  let gas=0n;
  if(name==='bounded-batches') {
   await assert.rejects(s.lockerFactory.settleAfterGraceBatch.staticCall(l.address,[],{gasLimit:10_000_000}),/BATCH_SIZE/);report.checks++;
   await assert.rejects(s.lockerFactory.settleAfterGraceBatch.staticCall(l.address,Array(9).fill(await ks[0].getAddress()),{gasLimit:12_000_000}),/BATCH_SIZE/);report.checks++;
   for(let start=0;start<99;start+=6){
    const group=await Promise.all(order.slice(start,Math.min(start+6,99)).map(i=>ks[i].getAddress()));
    const inputs=[ethers.ZeroAddress,...group,group[0]];
    const receipt=await tx(s.lockerFactory.settleAfterGraceBatch(l.address,inputs,{gasLimit:10_000_000}));gas+=receipt.gasUsed;
    const results=receipt.logs.map(x=>{try{return s.lockerFactory.interface.parseLog(x)}catch{return null}}).filter(x=>x?.name==='BatchSettlementResult');
    eq(results.filter(x=>x.args.success).length,group.length,'bad input and duplicate do not stop batch');
    eq(results.filter(x=>!x.args.success).length,2,'failures explicit');
    ok(receipt.gasUsed<10_000_000n,'batch fits gas budget');
   }
   await assert.rejects(l.vault.createOfficialPool.staticCall(0,(await now(p))+600),/UNSETTLED_COMMITMENTS/);report.checks++;
   // The final owner remains offline for a month; a stranger completes funding without consent.
   await setTime(p,(await now(p))+30*86400);
   const receipt=await tx(ks[order[99]].connect(s.signer).settleAfterGrace(l.address));gas+=receipt.gasUsed;
   report.finalOfflineLockerGas=String(receipt.gasUsed);
  }
  for(const i of order){
   if(name!=='bounded-batches'){const receipt=await tx(ks[i].connect(s.signer).settleAfterGrace(l.address));gas+=receipt.gasUsed;}
   const state=await ks[i].positions(l.address);
   eq(state.claimedSaleTokens,entitlement[i],'order-independent token entitlement');
   eq(state.wethSentToVault,net(gross(i)),'exact net settlement');
   eq(state.wethSentToVault+state.treasuryWeth+state.protocolFeeWeth,gross(i),'per-position conservation');
   eq(await s.weth.balanceOf(await ks[i].getAddress()),0n,'settled escrow empty');
  }
  eq(await l.launch.settledLiquidityWeth(),totalNet,'aggregate settled net');
  ok(await l.launch.allFinalCommitmentsSettled(),'all final commitments settled');
  await tx(l.vault.createOfficialPool(0,(await now(p))+600));
  eq(await l.vault.wethUsedForPool(),totalNet+totalPenalty,'all liquidity plus penalty in pool');
  eq(await l.vault.tokenUsedForPool(),eff,'all effective LP allocation in pool');
  eq(await s.weth.balanceOf(BURN),0n,'no successful contribution sent to dead');
  eq(await s.weth.balanceOf(await s.splitter.getAddress()),totalFee,'2% fees exact');
  const pair=new ethers.Contract(await l.vault.officialPair(),v2Artifact('UniswapV2Pair').abi,s.signer);
  const reserve=await pair.getReserves();
  eq(await pair.balanceOf(await l.vault.getAddress()),await pair.totalSupply()-1000n,'LP permanent vault lock except V2 minimum');
  const before=await l.token.totalSupply();const dust=await l.token.balanceOf(l.address);
  if(dust>0n)await tx(l.launch.burnResidualTokens());eq(await l.token.totalSupply(),before-dust,'residual burn conservation');
  let held=await l.token.balanceOf(BURN)+await l.token.balanceOf(await l.vault.getAddress())+await l.token.balanceOf(await pair.getAddress());
  for(const k of ks)held+=await l.token.balanceOf(await k.getAddress());
  eq(held,await l.token.totalSupply(),'all token balances conserved');
  await tx(s.splitter.distribute(await s.weth.getAddress()));
  let paid=0n;for(let i=0;i<4;i++){const share=i===3?totalFee-paid:totalFee*BigInt([5000,1250,1250,2500][i])/10000n;paid+=share;eq(await s.weth.balanceOf(s.recipients[i]),share,'fee destination share');}
  eq(await s.weth.balanceOf(await s.splitter.getAddress()),0n,'splitter empty');
  outputs.push([String(reserve[0]),String(reserve[1]),String(await pair.totalSupply())]);
  report.orders.push({name,settlementGas:String(gas),meanSettlementGas:String(gas/100n)});
 }
 for(const output of outputs.slice(1)){assert.deepEqual(outputs[0],output);report.checks++;}
 // Separate failed launch: refunds leave exact commitment accounting zero, no success fees.
 const f=await s.launch({minPhase1Weth:eth('200')});await setTime(p,f.cfg.startTime+1);
 const feeBefore=await s.weth.balanceOf(await s.splitter.getAddress());
 for(let i=0;i<100;i++)await tx(ks[i].commitToRound(f.address,0,f.rules,{value:eth('0.001')+BigInt(i)}));
 await setTime(p,Number(await f.launch.roundEnd(0))+f.cfg.refundSeconds+1);
 ok(await f.launch.launchFailed(),'insufficient R1 fails');
 for(let i=0;i<100;i++){await tx(ks[i].refundFailedLaunch(f.address,f.rules));await tx(ks[i].withdrawUnlockedWeth(f.address,eth('0.001')+BigInt(i)));}
 eq(await f.launch.exactCommittedLiquidityWeth(),0n,'failed-refund accumulator zero');eq(await f.launch.totalCommittedWeth(),0n,'failed-refund gross zero');
 eq(await s.weth.balanceOf(await s.splitter.getAddress()),feeBefore,'failed launch charged no protocol fees');
 report.status='passed';
} catch(e){report.status='failed';report.error=String(e.stack);throw e;}
finally{mkdirSync('runs/release',{recursive:true});writeFileSync(`runs/release/100-lockers-${SEED}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));p?.destroy();await child.kill('SIGTERM');}
