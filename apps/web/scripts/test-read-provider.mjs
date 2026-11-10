import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

// Run the actual TypeScript provider against an endpoint reporting another chain.
const source=readFileSync(process.env.D17_REVIEW_PROVIDER_SOURCE || new URL('../lib/readProvider.ts',import.meta.url),'utf8');
const module={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,
  {module,exports:module.exports,require:createRequire(import.meta.url),setTimeout});
let chainReads=0;
const server=createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  const q=JSON.parse(body);assert.equal(q.method,'eth_chainId');chainReads++;
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,result:'0x7a69'}));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
const wrong=module.exports.createReadProvider(url,1),right=module.exports.createReadProvider(url,31337);
try{
  await assert.rejects(()=>wrong.getNetwork(),/network changed/);
  assert.equal((await right.getNetwork()).chainId,31337n);
  assert.ok(chainReads>=2,'both configured providers actually query the endpoint');
  console.log('Read provider: 3 checks PASS (wrong chain rejected; matching chain accepted; actual chain queried).');
}finally{wrong.destroy();right.destroy();await new Promise(resolve=>server.close(resolve));}
