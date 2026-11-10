// Actual UI handlers + actual target guard + local EDR. No live wallet or funds.
import assert from 'node:assert/strict';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {ethers} from 'ethers';
import {artifact, deploy, eth, setTime, startNode, waitForRpc} from './helpers.mjs';
import {suite} from './release-fixture.mjs';
const require=createRequire(import.meta.url);
const uiPath=process.env.D17_REVIEW_UI_SOURCE || '../apps/web/app/terminal-client.tsx';
const source=readFileSync(uiPath,'utf8');
const guardSource=readFileSync('../apps/web/lib/transaction-target.ts','utf8');
const guardModule={exports:{}};
vm.runInNewContext(ts.transpileModule(guardSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:guardModule.exports,module:guardModule,require});
const {assertTransactionTarget,authenticatedContract,guardWalletSession}=guardModule.exports;
const ast=ts.createSourceFile(uiPath,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const report={uiSha256:createHash('sha256').update(source).digest('hex'),guardSha256:createHash('sha256').update(guardSource).digest('hex'),checks:[],limits:'Actual source-extracted handlers and EDR transactions, not rendered browser E2E. Canonical immutable deployment manifest is a trusted input.'};
const check=(label,ok)=>{assert.ok(ok,label);report.checks.push(label);};
function extract(name){let found;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name&&n.initializer)found=n.initializer.getText(ast);if(ts.isFunctionDeclaration(n)&&n.name?.text===name)found=n.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(found,name);return found;}
function evalFunction(name,ctx){return vm.runInContext(ts.transpileModule(`(${extract(name)})`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None,jsx:ts.JsxEmit.React}}).outputText,ctx);}
const child=startNode(9952);let p;
try{
 p=await waitForRpc(9952,child);const s=await suite(p),locker=await s.locker(0),other=await s.locker(1);
 const l=await s.launch({minPhase1Weth:eth('10')});const owner=await locker.owner(),attacker=await (await p.getSigner(12)).getAddress();
 const user=await p.getSigner(owner);
 const manifest={status:'deployed',chainId:31337,weth:await s.weth.getAddress(),contracts:{d17Factory:await s.factory.getAddress(),lockerFactory:await s.lockerFactory.getAddress()}};
 await setTime(p,l.cfg.startTime+1);
 const calls={errors:[],sent:[],notices:[],txLog:[]};let rejectUnwrap=false;
 const injected={request:async({method,params=[]})=>{if(method==='eth_requestAccounts'||method==='eth_accounts')return [owner];if(method==='eth_sendTransaction'){if(rejectUnwrap&&params[0].data?.startsWith(ethers.id('withdraw(uint256)').slice(0,10)))throw Object.assign(new Error('User rejected conversion'),{code:4001});calls.sent.push(params[0]);}return child.connection.provider.request({method,params});}};
 const noop=()=>{};const toast=(...a)=>calls.notices.push(a[0]);toast.error=toast;
 const ctx=vm.createContext({ethers,React:{createElement:()=>null},Date,Promise,console,authenticatedContract,guardWalletSession,
  PUBLIC_DEPLOYMENT:manifest,PROTOCOL_DEPLOYED:true,replayCutoff:null,CHAIN_ID_BIG:31337n,CHAIN_ID:31337,CHAIN_NAME:'Local',
  txSelectionRef:{current:'selection'},launchGenRef:{current:0},activeWalletRef:{current:injected},plainLanguage:false,toast,
  showError:(label,e)=>calls.errors.push(String(e)),setPendingAction:noop,setTxStartedAt:noop,setWalletAddress:noop,setLaunchVerified:noop,setTxLog:fn=>{calls.txLog=fn(calls.txLog);},
  refreshState:async()=>{},refreshActivity:async()=>{},txLabel:x=>x,resolveWalletForTx:()=>injected,
  ensureWalletChain:async w=>assert.equal(BigInt(await w.request({method:'eth_chainId'})),31337n),loadAbi:async name=>artifact(name+'.sol',name).abi,
  lockerAddress:attacker,launchAddress:l.address,selectedRound:0,rulesHashForTx:l.rules,contribution:'1',canCommit:true,canRefund:true,
  wethAddress:manifest.weth,wethWithdrawAmount:'0.5',position:null,
 });
 for(const name of ['requireAddress','assertChain','contractWithSigner','waitForTx','sendTx','commitToRound','verifyLaunch','refundCurrentRound','refundFailedLaunch','withdrawWeth','withdrawEthToWallet','finalizeLaunch'])ctx[name]=evalFunction(name,ctx);
 async function blocked(label,fn){const sent=calls.sent.length,errors=calls.errors.length;await fn();check(label+' rejected before wallet transaction',calls.sent.length===sent&&calls.errors.length===errors+1);}
 await blocked('deep-link EOA contribution',ctx.commitToRound);
 check('EOA attack leaves launch balance zero',await l.launch.totalCommittedWeth()===0n);
 ctx.lockerAddress=await other.getAddress();await blocked('another user registered Locker',ctx.commitToRound);
 const mimic=await deploy('D17Locker.sol','D17Locker',s.signer,[owner,manifest.contracts.d17Factory,manifest.weth]);
 ctx.lockerAddress=await mimic.getAddress();await blocked('unregistered Locker with truthful owner/factory/WETH',ctx.commitToRound);
 const foreign=await suite(p);const foreignLocker=await foreign.locker(0);
 ctx.lockerAddress=await foreignLocker.getAddress();await blocked('registered Locker from another deployment',ctx.commitToRound);
 ctx.lockerAddress=await locker.getAddress();const errors=calls.errors.length;
 await ctx.verifyLaunch();await ctx.commitToRound();
 check('canonical source handler succeeds',calls.errors.length===errors&&calls.sent.length===1);
 check('canonical contribution escrow matches',await locker.accountedWeth()===eth('1')&&await l.launch.totalCommittedWeth()===eth('1'));
 await setTime(p,l.cfg.startTime+600);await ctx.refundCurrentRound();
 check('early refund reserves exact one percent pending outcome',await locker.withdrawableWeth()===eth('0.99'));
 await ctx.withdrawWeth();
 check('partial withdrawal reaches original owner',await s.weth.balanceOf(owner)===eth('0.5'));
 await setTime(p,l.cfg.startTime+1200);await ctx.refundFailedLaunch();
 check('failed R1 restores all remaining principal without duplicate withdrawal',await locker.withdrawableWeth()===eth('0.5'));
 ctx.position={residualWethExact:'0.5',withdrawableWethExact:'0.5'};await ctx.withdrawEthToWallet();
 check('two-step WETH withdrawal and unwrap succeeds',await locker.accountedWeth()===0n&&await locker.withdrawableWeth()===0n&&await s.weth.balanceOf(owner)===eth('0.5'));
 check('legitimate refund path has no UI errors',calls.errors.length===errors);
 const l2=await s.launch({minPhase1Weth:eth('10')});ctx.launchAddress=l2.address;ctx.rulesHashForTx=l2.rules;ctx.contribution='0.2';
 await setTime(p,l2.cfg.startTime+1);await ctx.commitToRound();await setTime(p,l2.cfg.startTime+1200);await ctx.refundFailedLaunch();
 ctx.position={residualWethExact:'0.2',withdrawableWethExact:'0.2'};rejectUnwrap=true;await ctx.withdrawEthToWallet();rejectUnwrap=false;
 check('rejected second signature retains first withdrawal in wallet',await locker.withdrawableWeth()===0n&&await s.weth.balanceOf(owner)===eth('0.7'));
 check('partial success is explained without reporting full failure',calls.errors.length===errors&&calls.notices.includes('WETH withdrawal confirmed'));
 check('partial success keeps confirmed withdrawal hash',calls.txLog[0]?.label==='withdraw WETH'&&Boolean(calls.txLog[0]?.hash));
 ctx.launchAddress=attacker;await blocked('arbitrary launch finalization target',ctx.finalizeLaunch);ctx.launchAddress=l.address;
 for(const [name,address] of [['D17LockerFactory',manifest.contracts.lockerFactory],['D17Launch',l.address],['D17LiquidityVault',await l.vault.getAddress()],['WETH',manifest.weth]]){
  await assertTransactionTarget(name,address,user,manifest);check(name+' canonical target accepted',true);
  await assert.rejects(()=>assertTransactionTarget(name,address,user,{...manifest,contracts:{...manifest.contracts,d17Factory:attacker}}));check(name+' cannot trust EOA factory',true);
 }
 // Exercise send-boundary authentication again, after obtaining a valid contract.
 const guarded=await authenticatedContract('D17Locker',await locker.getAddress(),artifact('D17Locker.sol','D17Locker').abi,user,manifest);
 const savedFactory=manifest.contracts.d17Factory;manifest.contracts.d17Factory=attacker;
 await assert.rejects(()=>guarded.recoverExcessWeth(owner,1n));manifest.contracts.d17Factory=savedFactory;check('target revalidated at send boundary',true);
 const nonce=await p.getTransactionCount(owner);
 for(const scenario of ['chain','account','selection']){
  const wallet={request:async({method})=>method==='eth_chainId'?(scenario==='chain'?'0x1':'0x7a69'):[scenario==='account'?attacker:owner]};
  const guardedSession=guardWalletSession(user,wallet,31337,()=>scenario!=='selection');
  await assert.rejects(()=>guardedSession.sendTransaction({to:attacker,value:1n}));check('late '+scenario+' change blocked',true);
 }
 check('late changes sent no transaction',await p.getTransactionCount(owner)===nonce);
 report.walletTransactions=calls.sent.length;report.status='PASS';
}catch(e){report.status='ERROR';report.error=String(e.stack);throw e;}
finally{await p?.destroy();await child.kill();mkdirSync('runs/self-review',{recursive:true});writeFileSync('runs/self-review/wallet-target-guard.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
