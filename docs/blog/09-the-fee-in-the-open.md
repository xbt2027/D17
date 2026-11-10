# The fee, in the open

*D17 V15.1 · protocol fees and fixed recipients*

The V15.1 mainnet release policy fixes the protocol fee at **2% of retained successful commitments**. It is separate from the creator's treasury share, which can be at most10%. Each Locker's aggregate retained contribution is split at settlement:

```
retained contribution = liquidity share + creator treasury + protocol fee
```

Fees use integer arithmetic. Liquidity receives the exact remainder after the two fee amounts; amounts are not rounded separately for every top-up. The liquidity share is at least88% before any retained voluntary refund penalties are added.

## Failed R1 returns the principal

If R1 fails its minimum raise or anchor condition, the protocol fee is zero. Remaining principal and any previous R1 refund penalty return to the original Locker exactly once. Already withdrawn money is not paid twice. No failed-R1 amount is sent to D17, creator treasury or a dead address. The caller pays network gas separately.

A voluntary refund during a published window carries the stated penalty. For R1 it is retained only if the launch succeeds. Successful commitments pay the same published fee whether the owner settles or another caller settles after grace. A token entitlement that rounds to zero does not make a valid positive commitment exempt from settlement.

## Four fixed recipients

The protocol fee goes to an ownerless FeeSplitter with these ordered shares:

| Purpose | Share of protocol fee |
|---|---:|
| Ecosystem reserve | 50% |
| 2027 reserve | 12.5% |
| XBT reserve | 12.5% |
| Development and operations | 25% |

The last recipient receives any integer remainder. This splitter performs transfers; it does not implement an automatic buyback or guarantee how recipients later use funds. Final recipient addresses require public release verification.

## Freeze before publication

The generic FeeConfig contract supports a rate up to2% and changes for future launches while an owner exists. The **V15.1 mainnet release policy requires that owner and pending owner both be zero before publication**, with the rate fixed at200bps and recipient fixed to the verified splitter. It does not leave a multisig with permission to change future fees after that freeze.

Each launch also snapshots its fee and recipient into its immutable rules. The creator specifies a maximum accepted protocol fee, and creation reverts if the current fee exceeds it. These checks do not replace verification of the actual deployed graph, addresses and ownership state.

The candidate is not independently approved for mainnet. Historical V15 Sepolia fee settings and any still-owned generic test configurations are separate from this release policy.
