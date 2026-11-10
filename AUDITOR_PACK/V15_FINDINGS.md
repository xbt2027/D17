# Original V15 findings

## Aggregate versus per-Locker rounding

Launch-level liquidity estimates used an aggregate calculation while settlement
deducted protocol and treasury fees separately for each Locker. Integer rounding
means these totals can disagree. A proportional token-allocation calculation
using a smaller expected WETH total could demand more launch tokens than the
reserved allocation. Even a one-wei WETH discrepancy could therefore cause a
token transfer to revert and prevent pool creation.

## Uniswap V2 reserve capacity

ERC-20 amounts use uint256 while V2 pair reserves use uint112. V15 could accept
supply/allocation configurations whose intended pool balance exceeded the V2
reserve limit. Pool creation would then revert with the AMM's overflow check,
after the launch had accepted contributions. This is an integration validation
failure; V2 rejects the oversized reserve rather than silently wrapping it.

## Price-dependent late settlement

V15 could open the pool before every positive contribution settled. Later
contributions paired their allocated tokens and WETH at the current market
reserve ratio. Trading could change that ratio, leaving unmatched WETH or tokens.
The late path could send surplus WETH to the dead address and burn surplus
launch tokens. Ordinary trading was sufficient to cause the mismatch. This was
an economic flaw in the settlement lifecycle, not an accidental execution error.

## Scope distinction

Full failed-R1 principal refunds implement an economic policy decision. The
later wallet-target frontend finding is separate from the original V15 contract
findings. A very small pool-token allocation remains an economic configuration
risk; this export does not introduce a mandatory one-to-one sale/pool ratio.
