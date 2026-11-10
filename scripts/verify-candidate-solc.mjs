import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import solc from 'solc';
import { loadReleaseBuild } from '../contracts/scripts/release-build.mjs';
import { EXPLORER_CONTRACTS } from '../contracts/scripts/contract-list.mjs';

// A second compilation without Hardhat caches, using the archived standard input.
assert.equal(solc.version(), '0.8.38+commit.1835d247.Emscripten.clang');
const { artifacts, inputs } = loadReleaseBuild(EXPLORER_CONTRACTS);
const outputs = new Map();
for (const id of Object.keys(inputs)) {
  const text = readFileSync(`release/v15.1/build-inputs/${id}.json`, 'utf8');
  const archived = JSON.parse(text);
  assert.deepEqual(archived, inputs[id], 'ARCHIVED_COMPILER_INPUT_MISMATCH');
  const out = JSON.parse(solc.compile(JSON.stringify(archived.input)));
  assert.deepEqual((out.errors || []).filter(e => e.severity === 'error'), []);
  outputs.set(id, out);
}
const rows = [];
for (const [name, artifact] of Object.entries(artifacts)) {
  const actual = outputs.get(artifact.buildInfoId).contracts[`project/contracts/${name}.sol`][name];
  assert.deepEqual(actual.abi, artifact.abi, `${name}:ABI`);
  assert.equal('0x' + actual.evm.bytecode.object, artifact.bytecode, `${name}:CREATION`);
  assert.equal('0x' + actual.evm.deployedBytecode.object, artifact.deployedBytecode, `${name}:RUNTIME`);
  assert.deepEqual(actual.evm.deployedBytecode.immutableReferences, artifact.immutableReferences, `${name}:IMMUTABLES`);
  const runtimeBytes = actual.evm.deployedBytecode.object.length / 2;
  const creationBytes = actual.evm.bytecode.object.length / 2;
  assert.ok(runtimeBytes <= 24576, `${name}:EIP170`);
  assert.ok(creationBytes <= 49152, `${name}:EIP3860_BASE_INITCODE`);
  rows.push({ name, runtimeBytes, creationBytes, runtimeTemplateSha256: createHash('sha256').update(Buffer.from(actual.evm.deployedBytecode.object, 'hex')).digest('hex') });
}
console.log(JSON.stringify({status: 'passed', compiler: solc.version(), contracts: rows, limitations: 'Creation size excludes constructor arguments; deployed immutable values require separate runtime verification. No live-chain attestation.'}, null, 2));
