// EIP-7825 budget. Never infer that an unexplained revert is only an RPC gas cap.
export const TRANSACTION_GAS_CAP = 16_777_216n;
// App budget, measured with every other metadata field at its contract maximum.
// The protocol's 8192-byte URI bound is unchanged; not all combinations fit gas.
export const APP_LOGO_URI_MAX_BYTES = 4096;
export async function prepareLaunchGas({ simulateRead, simulateWallet, estimateRead, estimateWallet }) {
  try { await simulateRead(); }
  catch {
    try { await simulateWallet(); }
    catch { throw new Error('Launch simulation failed. Nothing was sent. Reduce the logo/metadata size or use a working RPC, then retry.'); }
  }
  let estimate;
  try { estimate = BigInt(await estimateRead()); }
  catch { estimate = BigInt(await estimateWallet()); }
  if (estimate <= 0n || estimate > TRANSACTION_GAS_CAP) throw new Error('Launch exceeds the transaction gas budget. Reduce the logo/metadata size and simulate again.');
  const buffered = (estimate * 120n + 99n) / 100n;
  return buffered < TRANSACTION_GAS_CAP ? buffered : TRANSACTION_GAS_CAP;
}
