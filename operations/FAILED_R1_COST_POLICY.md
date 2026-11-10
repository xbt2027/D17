# Failed R1: no D17 profit or launch-specific gas subsidy

User decision, 31 October 2026: if R1 fails, D17 must neither profit nor bear a net attributable cost. Existing success fee economics remain unchanged.

## Current cash-flow model

| Operation | Transaction / gas payer | D17 launch-specific revenue or subsidy |
|---|---|---|
| Create launch | Creator sends `D17Factory.createLaunch`; no ETH value or application fee | 0 |
| Create Locker / contribute | User sends own transaction; contributed ETH is wrapped into user escrow | 0 |
| Determine failed R1 | Time/threshold view, no keeper transaction required | 0 |
| Unlock failed refund | Locker owner sends `refundFailedLaunch` | 0 |
| Withdraw refunded WETH | Locker owner sends `withdrawUnlockedWeth` | 0 |

`createLaunch` is nonpayable. The website uses the connected user's signer. The API is a read/indexing service; no relayer/paymaster/sponsored refund executor exists. Failed R1 cannot proceed to fee-bearing success settlement or pool opening. Every consumed gas payment is a separate network expense of its sender; D17 does not receive it. D17 does not refund that sender-paid gas and must not charge for it a second time.

For this implementation, attributable gas actually advanced by D17 is zero, therefore the cost-recovery deduction is zero. Earlier voluntary R1 penalties return to their original Locker owners, once. Donations do not enlarge the claim. A failed-R1 dead-address WETH transfer is disabled.

## Boundary and future changes

The cash-neutrality statement is about the marginal onchain flow of one failed launch. Shared development, independent audit, RPC and hosting have real costs and are not priced or reimbursed per launch by this code. No blanket accounting break-even guarantee is made. D17 staff should not act as a discretionary sponsored caller and then expect unimplemented reimbursement.

Future cost recovery requires an auditable defined expense, a named payer, an immutable/disclosed cap and allocation, no duplicate recovery, no percentage masquerading as actual gas, and consent before participation. Transaction gas price can be deliberately inflated; `gasleft()`/`tx.gasprice` alone are not a complete or manipulation-proof reimbursement scheme. No such new transfer right is enabled by the present patch. Record any proposed sponsored flow in NEEDS_DECISION before implementation.

## Evidence / limits

`contracts/test/failed-refund-remediation.mjs` verifies owner WETH conservation, zero failed-launch fee, and that refund-claim transaction sender ETH decreases by exactly receipt gasUsed times effective gasPrice. Fixtures use local EDR; they do not establish live gas prices, audit closure or production financial performance. Historical V15 deployment retains its old behavior. New candidate bytecode requires separate audited deployment; mainnet NO-GO.
