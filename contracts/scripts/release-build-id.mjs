import {createHash} from 'node:crypto';

// Hardhat's local build ID can change with compiler installation/location.
// The release identity binds all archived input fields except that local ID.
function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])]));
  return value;
}
export function releaseBuildId(input) {
  const {id: _localId, ...content} = input;
  return 'solc-' + input.solcVersion.replaceAll('.', '_') + '-' + createHash('sha256').update(JSON.stringify(ordered(content))).digest('hex');
}
