import assert from 'node:assert/strict';
import { ethers } from 'ethers';

// Reconstruct the entire expected runtime, including every immutable slot.
// Merely masking immutable locations could accept a different dependency address.
export function expectedRuntimeBytecode(artifact, buildOutput, values = {}) {
  assert.equal(buildOutput.id, artifact.buildInfoId, 'BUILD_INFO_ID_MISMATCH');
  assert.match(artifact.deployedBytecode, /^0x(?:[0-9a-fA-F]{2})+$/, 'INVALID_RUNTIME_TEMPLATE');
  assert.equal(Object.keys(artifact.deployedLinkReferences || {}).length, 0, 'UNSUPPORTED_RUNTIME_LINKS');
  const declarations = new Map();
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.nodeType === 'VariableDeclaration' && value.mutability === 'immutable') declarations.set(String(value.id), value);
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object') visit(child);
    }
  }
  for (const source of Object.values(buildOutput.output.sources)) visit(source.ast);
  const bytes = ethers.getBytes(artifact.deployedBytecode);
  const usedNames = new Set();
  const occupied = new Set();
  for (const [id, slots] of Object.entries(artifact.immutableReferences || {})) {
    const declaration = declarations.get(id);
    assert.ok(declaration, `UNKNOWN_IMMUTABLE_ID:${id}`);
    const name = declaration.name;
    assert.ok(!usedNames.has(name), `AMBIGUOUS_IMMUTABLE_NAME:${name}`);
    usedNames.add(name);
    assert.ok(Object.hasOwn(values, name), `MISSING_IMMUTABLE:${name}`);
    let type = declaration.typeDescriptions.typeString;
    if (type === 'address payable' || type.startsWith('contract ')) type = 'address';
    assert.match(type, /^(address|bool|u?int(?:[0-9]+)?|bytes[0-9]+)$/, `UNSUPPORTED_IMMUTABLE_TYPE:${type}`);
    const encoded = ethers.getBytes(ethers.AbiCoder.defaultAbiCoder().encode([type], [values[name]]));
    assert.ok(slots.length > 0, `EMPTY_IMMUTABLE_SLOTS:${name}`);
    for (const { start, length } of slots) {
      assert.ok(Number.isInteger(start) && start >= 0 && length === encoded.length && start + length <= bytes.length, 'INVALID_IMMUTABLE_RANGE');
      for (let i = start; i < start + length; i++) {
        assert.ok(!occupied.has(i), 'OVERLAPPING_IMMUTABLE_RANGES');
        assert.equal(bytes[i], 0, 'NONZERO_IMMUTABLE_TEMPLATE');
        occupied.add(i);
      }
      bytes.set(encoded, start);
    }
  }
  assert.deepEqual(Object.keys(values).sort(), [...usedNames].sort(), 'UNEXPECTED_IMMUTABLE_VALUES');
  return ethers.hexlify(bytes);
}

export function compareRuntimeBytecode(artifact, buildOutput, values, actual) {
  const expected = expectedRuntimeBytecode(artifact, buildOutput, values);
  assert.match(actual, /^0x(?:[0-9a-fA-F]{2})*$/, 'INVALID_RUNTIME_RESPONSE');
  return {
    contractName: artifact.contractName,
    buildInfoId: artifact.buildInfoId,
    immutableValues: values,
    expectedRuntimeKeccak256: ethers.keccak256(expected),
    actualRuntimeKeccak256: ethers.keccak256(actual),
    expectedBytes: ethers.dataLength(expected),
    actualBytes: ethers.dataLength(actual),
    matches: expected.toLowerCase() === actual.toLowerCase(),
  };
}

// Input must come from a separately reviewed file, not the deployment's own claims.
export function validateFeePolicy(policy, chainId) {
  assert.equal(policy.schema, 'd17-reviewed-fee-policy-v1', 'POLICY_SCHEMA');
  assert.ok(Number.isSafeInteger(policy.chainId) && policy.chainId === chainId, 'POLICY_CHAIN_ID');
  assert.equal(policy.protocolFeeBps, 200, 'POLICY_FEE_NOT_200');
  assert.deepEqual(policy.feeSplitBps, [5000, 1250, 1250, 2500], 'POLICY_SHARES');
  assert.ok(Array.isArray(policy.feeSplitRecipients) && policy.feeSplitRecipients.length === 4, 'POLICY_FOUR_RECIPIENTS');
  const recipients = policy.feeSplitRecipients.map(ethers.getAddress);
  assert.ok(recipients.every(a => a !== ethers.ZeroAddress), 'POLICY_ZERO_RECIPIENT');
  assert.equal(new Set(recipients).size, 4, 'POLICY_DUPLICATE_RECIPIENT');
  return { ...policy, feeSplitRecipients: recipients };
}
