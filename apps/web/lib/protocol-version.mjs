/** Published deployment metadata chooses ABI semantics, never an untrusted launch. */
export function abiBasePath(version) {
  if (version === 'V15_1') return '/abi/v15.1';
  if (version === 'V15_HARDENED') return '/abi';
  throw new Error(`Unsupported D17 protocol version: ${version}`);
}
export function requiresCompleteSettlement(version) {
  abiBasePath(version); // Fail closed for unknown versions.
  return version === 'V15_1';
}
/** A missing current-contract read can never authorize pool opening. */
export function poolFundingReady(version, allSettled, anySettled) {
  return requiresCompleteSettlement(version) ? allSettled === true : anySettled === true;
}
