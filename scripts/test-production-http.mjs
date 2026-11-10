// Production Next HTTP surface check; explicitly not browser or wallet E2E.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
const require=createRequire(import.meta.url);
const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3052'],{cwd:'apps/web',stdio:'ignore',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});
const base='http://127.0.0.1:3052';let checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;};
try{
 let ready=false;for(let i=0;i<60;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}check(ready,'production server ready');
 const blogs=readdirSync('docs/blog').filter(f=>/^\d\d-.*\.md$/.test(f)).map(f=>'/blog/'+f.slice(0,-3));
 const pages=['/','/deploy','/docs','/docs/guide','/docs/contracts','/docs/technical','/docs/v15-changes','/docs/self-hosting','/blog','/progress',...blogs];
 for(const route of pages){const r=await fetch(base+route);check(r.status===200,route+': status');check(r.headers.get('x-frame-options')==='DENY',route+': frame protection');check(r.headers.get('x-content-type-options')==='nosniff',route+': MIME protection');check(r.headers.get('referrer-policy')==='no-referrer',route+': no referrer');check(r.headers.get('content-security-policy')?.includes("object-src 'none'"),route+': object CSP');await r.text();}
 const technical=await (await fetch(base+'/docs/technical')).text();check(technical.includes('0.8.38'),'current compiler docs served');
 const fees=await (await fetch(base+'/blog/09-the-fee-in-the-open')).text();check(fees.includes('pending owner both be zero'),'current fee freeze served');
 for(const name of readdirSync('release/v15.1/abi').filter(f=>f.endsWith('.json'))){const r=await fetch(base+'/abi/v15.1/'+name);check(r.ok,name+': public ABI available');assert.deepEqual(await r.json(),JSON.parse(readFileSync('release/v15.1/abi/'+name)));checks++;}
 console.log(JSON.stringify({status:'PASS',checks,pages:pages.length,limitation:'HTTP response/content/security headers and versioned ABI parity only. No JavaScript hydration or wallet/browser execution.'}));
}finally{child.kill('SIGTERM');await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));}
