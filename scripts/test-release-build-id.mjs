import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseBuildId} from '../contracts/scripts/release-build-id.mjs';
const input={id:'local-a',_format:'hh-sol-build-info-1',solcVersion:'0.8.24',solcLongVersion:'0.8.24+commit.e11b9ed9',input:{language:'Solidity',sources:{'A.sol':{content:'contract A {}'}},settings:{viaIR:true,optimizer:{enabled:true,runs:1}}}};
test('local identity and JSON key order do not change release input identity',()=>{
 const changed=JSON.parse(JSON.stringify(input));changed.id='local-other-installation';
 assert.equal(releaseBuildId(input),releaseBuildId(changed));
 assert.equal(releaseBuildId(input),releaseBuildId(Object.fromEntries(Object.entries(changed).reverse())));
 assert.equal(input.id,'local-a','input is not mutated');
});
for(const [label,mutate] of [
 ['source',x=>{x.input.sources['A.sol'].content='contract B {}';}],
 ['compiler patch',x=>{x.solcVersion='0.8.25';}],
 ['compiler build',x=>{x.solcLongVersion='different';}],
 ['optimizer',x=>{x.input.settings.optimizer.runs=200;}],
 ['viaIR',x=>{x.input.settings.viaIR=false;}],
 ['unexpected additional metadata',x=>{x.extra='unreviewed';}],
])test(`release identity changes with ${label}`,()=>{const changed=structuredClone(input);mutate(changed);assert.notEqual(releaseBuildId(input),releaseBuildId(changed));});
