# Settlement without an owner signature

*D17 V15.1 · settlement and permissionless completion*

After the five rounds, anyone can finalize a successful launch. V15.1 opens trading only after every final contribution has settled. Settlement pays the published treasury/protocol shares, moves liquidity WETH to the Vault and credits the participant's sale tokens to their own Locker.

Owners can settle themselves. After grace, anyone can call `settleAfterGrace` on another canonical Locker, or process up to eight Lockers with `settleAfterGraceBatch`. Invalid or repeated entries do not invalidate successful peers. Tokens stay in the participant's Locker, so the public caller cannot redirect the claim. The direct call remains available if a batch cannot complete.

There is no post-open settlement path: the pool starts with all committed liquidity. Token entitlements and fees do not depend on which participant settles first. An offline owner does not have to sign or accept a callback. Withdrawals from the settled Locker remain owner-controlled and do not expire; losing the owner key is not repaired by third-party settlement.

Permissionless does not mean automatic or free. Aggregate gas grows with the number of positions. Someone must pay for finalization, settlement and pool creation; there is no guaranteed keeper. These costs and the full-funding condition are part of the launch mechanics.

Creator vesting release and appropriate cleanup functions are also permissionless, with destinations fixed by the contracts. LP remains permanently in the Vault. V15.1 is a preliminary candidate pending independent audit and live deployment verification.
