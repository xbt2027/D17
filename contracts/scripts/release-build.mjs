import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { artifact, readJson, root } from './lib.mjs';
import { releaseBuildId } from './release-build-id.mjs';

// Reject stale artifacts even when their local template/manifest agree with one another.
export function loadReleaseBuild(names) {
  const artifacts = {}, builds = {}, inputs = {}, sources = {};
  for (const name of names) {
    const art = artifact(`${name}.sol`, name);
    assert.match(art.buildInfoId, /^solc-[a-zA-Z0-9_-]+$/);
    const input = readJson(`artifacts/build-info/${art.buildInfoId}.json`);
    const output = readJson(`artifacts/build-info/${art.buildInfoId}.output.json`);
    assert.equal(input.id, art.buildInfoId, 'INPUT_BUILD_ID');
    assert.equal(output.id, art.buildInfoId, 'OUTPUT_BUILD_ID');
    assert.equal(input.solcVersion, '0.8.38', 'COMPILER_VERSION');
    assert.equal(input.solcLongVersion, '0.8.38+commit.1835d247', 'COMPILER_LONG_VERSION');
    const s = input.input.settings;
    assert.equal(s.evmVersion, 'shanghai'); assert.equal(s.viaIR, true);
    assert.deepEqual(s.optimizer, { enabled: true, runs: 1 }); assert.deepEqual(s.metadata, { bytecodeHash: 'none' });
    for (const [source, value] of Object.entries(input.input.sources)) {
      assert.ok(source.startsWith('project/contracts/'), 'UNEXPECTED_SOURCE_NAMESPACE');
      const relative = source.slice('project/'.length);
      assert.ok(!relative.split('/').includes('..'), 'SOURCE_PATH_TRAVERSAL');
      const text = readFileSync(path.join(root, relative), 'utf8');
      assert.equal(value.content, text, `STALE_BUILD_SOURCE:${relative}`);
      sources[relative] = createHash('sha256').update(text).digest('hex');
    }
    const emitted = output.output.contracts[`project/contracts/${name}.sol`]?.[name];
    assert.ok(emitted, 'BUILD_CONTRACT_MISSING');
    assert.deepEqual(art.abi, emitted.abi, 'ARTIFACT_ABI_MISMATCH');
    assert.equal(art.bytecode, '0x' + emitted.evm.bytecode.object, 'ARTIFACT_CREATION_MISMATCH');
    assert.equal(art.deployedBytecode, '0x' + emitted.evm.deployedBytecode.object, 'ARTIFACT_RUNTIME_MISMATCH');
    assert.deepEqual(art.immutableReferences, emitted.evm.deployedBytecode.immutableReferences, 'ARTIFACT_IMMUTABLE_MISMATCH');
    // Normalize only after raw IDs, sources and emitted bytecode have passed
    // validation. This does not allow a stale or mismatched artifact through.
    const id = releaseBuildId(input);
    artifacts[name] = { ...art, buildInfoId: id };
    builds[name] = { ...output, id };
    inputs[id] = { ...input, id };
  }
  return { artifacts, builds, inputs, sources };
}
