// Actual Chromium + rendered Next.js app + local EDR; injected wallet is a test shim.
// Install the isolated browser-tools lockfile first; see browser-tools/README.md.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,createWriteStream,chmodSync} from 'node:fs';
import {brotliDecompressSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {ethers} from 'ethers';
import {startNode,waitForRpc,now,setTime,eth,wait,root} from './helpers.mjs';
import {suite} from './release-fixture.mjs';
const require=createRequire(import.meta.url);
const browserRequire=createRequire(path.join(root,'browser-tools/package.json'));
const pw=process.env.D17_PLAYWRIGHT_MODULE || browserRequire.resolve('playwright');
const {chromium}=require(pw);
const report={checks:[],walletSends:[],walletSendRequests:[],declinedUnwraps:0,errors:[],status:'running',limits:'Actual rendered local Next.js in Chromium; injected EIP-1193 test wallet, local EDR and fixture WETH. No real extension, mobile wallet, public RPC, mainnet fork, or production-origin attestation.'};
const check=(label,value)=>{report.checks.push({label,ok:!!value});assert.ok(value,label);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(label,fn)=>{for(let i=0;i<200;i++){if(await fn())return;await sleep(100);}throw new Error('Timed out: '+label);};
mkdirSync('runs/rendered-wallet',{recursive:true});
// The packed executable avoids a separate browser CDN dependency. Extract just the
// executable: the vendor's tar helper attempts chown, unsupported in this runner.
let executablePath=process.env.D17_CHROMIUM_EXECUTABLE;
if(!executablePath){
 executablePath=path.join(root,'runs/rendered-wallet/chromium');
 const packed=path.resolve(path.dirname(browserRequire.resolve('@sparticuz/chromium')),'../bin/chromium.br');
 writeFileSync(executablePath,brotliDecompressSync(readFileSync(packed)));chmodSync(executablePath,0o755);
}
report.chromiumSha256=createHash('sha256').update(readFileSync(executablePath)).digest('hex');
report.playwrightVersion=require(path.join(path.dirname(require.resolve(pw)),'package.json')).version;
report.webMode=process.env.D17_BROWSER_WEB_MODE || 'production';
assert.ok(['production','development'].includes(report.webMode),'known web test mode');
const nextEnvPath=path.join(root,'../apps/web/next-env.d.ts');const oldNextEnv=readFileSync(nextEnvPath);
const log=createWriteStream('runs/rendered-wallet/next.txt');
let browser,server,web,p,page;const child=startNode(9751);let walletAccount,walletChain='0x7a69',rejectNextUnwrap=false;
try{
 p=await waitForRpc(9751,child);const s=await suite(p);const k=await s.locker(0);
 walletAccount=await k.owner();
 const l=await s.launch({minPhase1Weth:eth('10')});const penalty=await s.launch({minPhase1Weth:eth('0.01')});await setTime(p,penalty.cfg.startTime+1);
 server=createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:3051');res.setHeader('Access-Control-Allow-Headers','content-type');
  if(req.method==='OPTIONS'){res.end();return;}
  let body='';for await(const b of req)body+=b;
  const handle=async x=>{try{return {jsonrpc:'2.0',id:x.id,result:await child.connection.provider.request({method:x.method,params:x.params||[]})}}catch(e){return {jsonrpc:'2.0',id:x.id,error:{code:e.code||-32603,message:e.message,data:e.data}}}};
  try{const a=JSON.parse(body);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(Array.isArray(a)?await Promise.all(a.map(handle)):await handle(a)));}catch{res.statusCode=400;res.end();}
 });await new Promise(r=>server.listen(9751,'127.0.0.1',r));
 const env={...process.env,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_D17_ENABLE_LOCAL:'true',NEXT_PUBLIC_D17_DEFAULT_NETWORK:'local',NEXT_PUBLIC_D17_LOCAL_RPC_URL:'http://127.0.0.1:9751',NEXT_PUBLIC_D17_DATA_MODE:'rpc',NEXT_PUBLIC_ENABLE_DEPLOY:'false',NEXT_PUBLIC_ENABLE_TEST_CONTROLS:'false',NEXT_PUBLIC_ENABLE_USD:'false',NEXT_PUBLIC_D17_LOCAL_D17_FACTORY:await s.factory.getAddress(),NEXT_PUBLIC_D17_LOCAL_FEE_CONFIG:await s.feeConfig.getAddress(),NEXT_PUBLIC_D17_LOCAL_LOCKER_FACTORY:await s.lockerFactory.getAddress(),NEXT_PUBLIC_D17_LOCAL_WETH:await s.weth.getAddress(),NEXT_PUBLIC_D17_LOCAL_ROUTER:await s.router.getAddress()};
 const next=require.resolve('next/dist/bin/next');
 if(report.webMode==='production'){
  const build=spawn(process.execPath,[next,'build','--webpack'],{cwd:path.join(root,'../apps/web'),env,stdio:['ignore','pipe','pipe']});
  build.stdout.pipe(log,{end:false});build.stderr.pipe(log,{end:false});
  report.buildExit=await new Promise((resolve,reject)=>{build.on('error',reject);build.on('exit',resolve);});
  assert.equal(report.buildExit,0,'production fixture build');
 }
 const webArgs=report.webMode==='production'?['start']:['dev','--webpack'];
 web=spawn(process.execPath,[next,...webArgs,'--hostname','127.0.0.1','--port','3051'],{cwd:path.join(root,'../apps/web'),env,stdio:['ignore','pipe','pipe']});web.stdout.pipe(log,{end:false});web.stderr.pipe(log,{end:false});
 let ready=false;for(let i=0;i<90;i++){try{const r=await fetch('http://127.0.0.1:3051');if(r.ok){ready=true;break;}}catch{}await sleep(500);}
 assert.ok(ready,'NEXT_START');
 browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const context=await browser.newContext();
 await context.exposeBinding('__walletRequest',async(_,{method,params})=>{
  if(method==='eth_accounts'||method==='eth_requestAccounts')return [walletAccount];
  if(method==='eth_chainId')return walletChain;
  if(method==='wallet_switchEthereumChain')throw {code:4001,message:'Test user rejected chain switch'};
  if(method==='eth_sendTransaction'){
   const tx=params[0];report.walletSendRequests.push(tx);
   if(rejectNextUnwrap&&tx.to.toLowerCase()===(await s.weth.getAddress()).toLowerCase()&&tx.data.startsWith('0x2e1a7d4d')){rejectNextUnwrap=false;report.declinedUnwraps++;throw new Error('Test user rejected WETH conversion');}
   assert.equal(walletChain,'0x7a69','test wallet only sends to local EDR');assert.equal(tx.from.toLowerCase(),walletAccount.toLowerCase(),'test wallet signer');
   const hash=await child.connection.provider.request({method,params});report.walletSends.push({...tx,hash});return hash;
  }
  return child.connection.provider.request({method,params:params||[]});
 });
 await context.addInitScript(({offset})=>{
  const real=Date.now.bind(Date);window.__clockOffset=offset;Date.now=()=>real()+window.__clockOffset;
  const listeners={};window.ethereum={request:args=>window.__walletRequest(args),on:(e,fn)=>(listeners[e]||=[]).push(fn),removeListener:(e,fn)=>{listeners[e]=(listeners[e]||[]).filter(x=>x!==fn)}};
  window.__walletEvent=(e,value)=>(listeners[e]||[]).forEach(fn=>fn(value));
 },{offset:(await now(p))*1000-Date.now()});
 report.blockedExternalRequests=[];
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(['127.0.0.1','localhost'].includes(url.hostname))return route.continue();
  report.blockedExternalRequests.push(url.origin+url.pathname);return route.abort();
 });
 report.browserVersion=browser.version();page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(String(e)));
 const syncClock=async()=>page.evaluate(offset=>{window.__clockOffset=offset;},(await now(p))*1000-Date.now());
 const advance=async(time)=>{await setTime(p,time);await syncClock();};
 const open=async(address,rules)=>{await page.goto(`http://127.0.0.1:3051/?network=local&view=simple&launch=${address}&rulesHash=${rules}`);await syncClock();};
 await open(l.address,l.rules);
 await page.getByRole('button',{name:/Connect wallet/i}).first().click();
 await page.getByLabel('Amount of ETH to put in').fill('0.01');
 const put=page.getByRole('button',{name:'Put in 0.01 ETH',exact:true});await put.waitFor();
 walletChain='0x1';const before=report.walletSendRequests.length;await put.click();
 await page.getByText('Your wallet is on another network. Accept the switch to Localhost in your wallet, then try again.',{exact:true}).first().waitFor();
 check('wrong wallet chain and rejected switch cause no eth_sendTransaction',report.walletSendRequests.length===before);
 walletChain='0x7a69';await put.click();
 for(let i=0;i<100 && await k.accountedWeth()!==eth('0.01');i++)await sleep(100);
 check('real rendered commit escrows exactly 0.01 WETH in canonical Locker',await k.accountedWeth()===eth('0.01'));
 check('wallet send targets the owned registered Locker',report.walletSends.length===before+1&&ethers.getAddress(report.walletSends.at(-1).to)===await k.getAddress());
 check('Launch and Locker accounting agree after browser action',await l.launch.totalCommittedWeth()===eth('0.01'));
 walletAccount=await (await p.getSigner(3)).getAddress();await page.evaluate(a=>window.__walletEvent('accountsChanged',[a]),walletAccount);
 await page.getByRole('button',{name:/Create.*vault/i}).first().waitFor();
 check('account change forgets old owner Locker',!(await page.getByRole('button',{name:'Put in 0.01 ETH',exact:true}).count()));

 // A second owner creates their own Locker from the rendered UI and contributes.
 await page.getByRole('button',{name:/Create my personal vault/}).click();
 await until('new owner Locker created',async()=>(await s.factory.lockersOfOwner(walletAccount)).length===1);
 const k2Address=(await s.factory.lockersOfOwner(walletAccount))[0];
 const k2=new ethers.Contract(k2Address,k.interface,await p.getSigner(3));
 check('new account creates its own canonical Locker',await k2.owner()===walletAccount);
 await open(penalty.address,penalty.rules);await page.getByRole('button',{name:/Connect wallet/i}).first().click();
 await page.getByLabel('Amount of ETH to put in').fill('0.02');await page.getByRole('button',{name:'Put in 0.02 ETH',exact:true}).click();
 await until('second owner contributes',async()=>await k2.accountedWeth()===eth('0.02'));
 check('second contribution never touches old owner Locker',await k.accountedWeth()===eth('0.01'));
 // Refund while R1 met its floor; removing this owner makes it fail after the window.
 await advance(penalty.cfg.startTime+601);await open(penalty.address,penalty.rules);
 await page.getByRole('button',{name:/Connect wallet/i}).first().click();
 await page.getByRole('button',{name:'Take back my ETH',exact:true}).click();
 await until('voluntary refund credited',async()=>await k2.withdrawableWeth()===eth('0.0198'));
 check('R1 voluntary refund retains exactly 1 percent pending outcome',await s.weth.balanceOf(await penalty.vault.getAddress())===eth('0.0002'));
 rejectNextUnwrap=true;await page.getByRole('button',{name:'Send 0.0198 ETH to my wallet',exact:true}).click();
 await page.getByText('WETH withdrawal confirmed',{exact:true}).waitFor();
 check('rejected second signature preserves first WETH withdrawal',await s.weth.balanceOf(walletAccount)===eth('0.0198')&&await k2.withdrawableWeth()===0n&&report.declinedUnwraps===1);
 check('partial completion explicitly explains unconfirmed ETH conversion',await page.getByText(/The ETH conversion was not confirmed/).isVisible());
 await advance(penalty.cfg.startTime+1201);await open(penalty.address,penalty.rules);
 await page.getByRole('button',{name:/Connect wallet/i}).first().click();
 await page.getByRole('button',{name:'Unlock my refund',exact:true}).click();
 await until('penalty-only failed refund',async()=>await k2.withdrawableWeth()===eth('0.0002'));
 check('failed R1 returns prior penalty without repaying withdrawn net',await k2.failedRefundDue(penalty.address)===0n&&await k2.accountedWeth()===eth('0.0002'));
 await page.getByRole('button',{name:'Send 0.0002 ETH to my wallet',exact:true}).click();
 await until('penalty withdrawal and unwrap mined',async()=>await k2.accountedWeth()===0n&&await s.weth.balanceOf(walletAccount)===eth('0.0198'));
 await page.getByText('Done',{exact:true}).last().waitFor();
 check('prior rejected unwrap is not silently converted or paid again',await s.weth.balanceOf(walletAccount)===eth('0.0198'));
 await page.getByText('ETH waiting for you',{exact:true}).waitFor({state:'hidden'});
 check('failed-launch UI does not falsely claim all funds are ETH',!(await page.locator('body').innerText()).includes('Your ETH is back in your wallet.'));
 check('completed refund explicitly distinguishes ETH and WETH',await page.getByText(/Your refund has left this vault.*ETH or WETH/).isVisible());
 // Original owner recovers full untouched principal; exercise a phone-sized viewport.
 walletAccount=await k.owner();await page.setViewportSize({width:390,height:844});await open(l.address,l.rules);
 await page.getByRole('button',{name:/Connect wallet/i}).first().click();
 await page.getByRole('button',{name:'Unlock my refund',exact:true}).click();
 await until('full principal unlocked',async()=>await k.withdrawableWeth()===eth('0.01'));
 check('failed R1 unlocks full original principal',await k.failedRefundDue(l.address)===0n);
 const balanceBefore=await p.getBalance(walletAccount);const sendStart=report.walletSends.length;
 await page.getByRole('button',{name:'Send 0.01 ETH to my wallet',exact:true}).click();
 await until('principal withdrawal and conversion',async()=>report.walletSends.length===sendStart+2&&await k.accountedWeth()===0n&&await s.weth.balanceOf(walletAccount)===0n);
 const receipts=await Promise.all(report.walletSends.slice(sendStart).map(tx=>p.getTransactionReceipt(tx.hash)));
 const gasCost=receipts.reduce((sum,r)=>sum+r.fee,0n);
 const balanceAfter=await p.getBalance(walletAccount);
 report.fullPrincipalRefund={principalWei:eth('0.01').toString(),walletBeforeWei:balanceBefore.toString(),walletAfterWei:balanceAfter.toString(),withdrawAndUnwrapGasWei:gasCost.toString()};
 check('phone-width full refund returns 0.01 ETH minus only caller gas',balanceAfter===balanceBefore+eth('0.01')-gasCost);
 await page.getByText('Done',{exact:true}).last().waitFor();
 check('claimed refund button disappears',await page.getByRole('button',{name:'Unlock my refund',exact:true}).count()===0);
 check('phone viewport has no horizontal page overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 for(const [label,address] of [['D17 FeeSplitter',await s.splitter.getAddress()],['creator treasury',s.treasury],['dead address','0x000000000000000000000000000000000000dEaD'],['failed principal vault',await l.vault.getAddress()],['failed penalty vault',await penalty.vault.getAddress()]])check(label+' has no retained failed-launch WETH',await s.weth.balanceOf(address)===0n);
 const after=report.walletSendRequests.length;
 await open(await (await p.getSigner(10)).getAddress(),l.rules);
 await sleep(1000);
 check('unregistered deep link sends no transaction',report.walletSendRequests.length===after);
 check('unregistered deep link offers no contribution button',!(await page.getByRole('button',{name:/^Put in/}).count()));
 await page.goto('http://127.0.0.1:3051/?network=mainnet&view=simple');
 await page.getByText(/not.*mainnet|not deployed|not live/i).first().waitFor();
 check('mainnet not-deployed manifest sends no transaction',report.walletSendRequests.length===after);
 check('mainnet not-deployed screen exposes no contribution or refund action',await page.getByRole('button',{name:/^(Put in|Create my personal vault|Unlock my refund|Send .* ETH to my wallet)/}).count()===0);
 report.receipts=[];
 for(const tx of report.walletSends){const r=await p.getTransactionReceipt(tx.hash);check('local wallet transaction succeeded: '+tx.hash,r.status===1);report.receipts.push({hash:r.hash,from:r.from,to:r.to,status:r.status,gasUsed:r.gasUsed.toString(),gasCostWei:r.fee.toString()});}
 check('all submitted wallet transactions use local chain 31337',report.walletSends.every(tx=>tx.chainId==='0x7a69'));
 check('rendered app has no uncaught JavaScript exception',report.errors.length===0);
 report.status='PASS';
}catch(e){report.status='FAIL';report.error=String(e.stack);if(page)report.lastBody=await page.locator('body').innerText().catch(()=>'(unavailable)');throw e;}
finally{await browser?.close();web?.kill('SIGTERM');if(web)await new Promise(r=>web.exitCode!==null?r():web.once('exit',r));log.end();await new Promise(r=>server?server.close(r):r());await p?.destroy();await child.kill();writeFileSync(nextEnvPath,oldNextEnv);writeFileSync('runs/rendered-wallet/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
