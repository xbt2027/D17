# D17 V15.1 technical reference

**Preliminary release candidate; mainnet NO-GO. No independent audit or final Sepolia proof is claimed.** Existing Sepolia deployments remain historical V15 and use their original ABI. V15.1 build/ABI files live under `release/v15.1`; exact delivered source commit is in the checkpoint manifest.

## Contract graph and trust boundaries

| Component | Responsibility and authority |
|---|---|
| D17Factory | Validates deployer parameters, reads frozen fee policy, registers launches and canonical Lockers. LaunchFactory and LockerFactory are pinned once; ownership must be renounced before launch creation. |
| D17LaunchFactory / LaunchDeployer / TokenFactory / LiquidityVaultFactory | Create the bound launch/token/vault graph. Their configurable factory links are pinned before their relevant owners renounce. |
| D17Launch | Immutable rules, timing, contribution/refund ledger, round allocation, finalization and settlement accounting. Only registered Lockers change participant positions; only its Vault claims pool assets. |
| D17Locker | Immutable owner/factory/WETH, participant custody and withdrawal rights. Owner commits/refunds/withdraws; after grace anyone may settle to this same Locker. |
| D17LockerFactory | Self-registration and permissionless batches of 1–8 canonical Lockers, 1M gas per settlement subcall plus overhead; failure isolation and direct-call fallback. |
| D17LiquidityVault | Creates one complete official V2 pool, permanently holds LP, releases creator allocation over 180 days. No LP recovery/withdrawal function. |
| D17Token | Fixed supply, closed minting and renounced owner; pre-open transfer gate permits protocol distribution and vault-to-pair funding. Transfers and sales are unrestricted after opening. |
| D17FeeConfig | Current fee snapshot for future launches only. V15.1 mainnet requires exactly 200 bps and both owner/pendingOwner zero before creating a launch. |
| D17FeeSplitter | Ownerless fixed recipients/shares; permissionless WETH distribution. No automatic buyback. Plain ETH may be wrapped and distributed. |

Trust assumptions: authentic non-hooked WETH9 and Uniswap V2 Factory/Pair; honest RPC responses for verification; user-controlled deployment signatures; reviewed recipient/Safe addresses. A hash binds bytes but does not attest ownership of an address or an honest RPC. Repeat live verification against an independent provider.

## Five rounds and refund rules

Use 0-based indices in code, R1–R5 in the UI. Every allocation is integer arithmetic in token wei. Let S be saleTokens and b[r] each round's share in basis points. Base allocation A[r] = floor(S*b[r]/10000).

R1 succeeds only when its retained commitments satisfy minPhase1Weth and its anchor price floor. Anchor = floor(roundRaised[0]*1e18/A[0]). The first-round refund window ends before this condition determines failure. Failed-launch remaining contributions are refundable without protocol success fees. On R1 failure, prior voluntary R1 penalties are also returned exactly once to the original Locker. Historical penalty-paid counters remain intact; separate returned counters prevent duplicate refunds. No failed-launch success fee or WETH transfer to dead is permitted. Callers pay their own network gas separately. This supersedes historical V15 behavior under user-approved ND-003 (31 October 2026).

For R2–R4, target[r] = floor(allocation[r]*anchor/1e18). If raised >= target, the round sells its allocation; otherwise sold[r] = floor(allocation[r]*raised/target). Unsold R2–R4 allocations roll into R5. R5 uses its base plus this rollover and the same anchor floor. Final unsold sale tokens and proportional unused LP allocation are burned.

A participant's retained round contribution is its gross contribution minus refunded principal. Fees are assessed at settlement, not used to reweight participants within a round. Entitlement = floor(sold[r]*paid[participant,r]/roundRaised[r]). R1 uses its full base allocation if successful. Claims sum these per-round results; rounding dust is not awarded to a privileged user.

Refund windows follow R1–R4, never R5. R1/R2 penalty is 100 bps; R3/R4 use the immutable refundPenaltyBps (100–2500). A refund removes the entire current-round position; the penalty goes to the Vault, and the remainder becomes owner-withdrawable WETH in the Locker.

## Exact settlement and D-002

For each Locker, G is its aggregate retained contribution across all five rounds, F=floor(G*200/10000), T=floor(G*treasuryBps/10000), and L=G-F-T. `exactCommittedLiquidityWeth` stores sum(L) across Lockers. Top-ups/refunds update the difference between the old and new Locker-level value. Applying a percentage once to total gross, or rounding each top-up separately, is incorrect.

Finalization snapshots finalCommittedWeth, burns unsold sale tokens, and sets effectiveLpTokens=floor(lpTokens*soldSaleTokens/saleTokens). Pool opening waits until max(tradingOpenAt, finalizedAt+settlementSeconds). Every positive final commitment must have settled, and settledLiquidityWeth must equal exactCommittedLiquidityWeth.

Owner `settleAndClaim` and permissionless `settleAfterGrace` deliver the same tokens/fees into the same escrow. Third-party callers cannot redirect tokens or require an owner callback. Batches isolate invalid, repeated and failed targets; there is no global unbounded participant loop. Aggregate gas still scales with participants, and someone must pay it. No automatic keeper or guaranteed wall-clock completion is promised.

The initial pool receives all L plus retained refund penalties, paired with all effectiveLpTokens. `claimLateSettlement` and `mintLateLiquidity` are legacy ABI stubs that revert `LATE_SETTLEMENT_DISABLED`. There is no post-open contribution path and no successful-launch late WETH burn. Pool price cannot influence settlement amounts.

## LP, donations, tokens and FeeSplitter

All minted LP goes to the Vault; V2 separately locks MINIMUM_LIQUIDITY. Token pre-seeding is refused and pre-open transfers prevent ordinary users from injecting launch tokens. Unsolicited WETH may increase opening reserves; synced and unsynced donation tests use real V2 Pair bytecode. Such donations do not create a claim for the donor. These directed tests are not an exhaustive MEV/arbitrage proof.

Creator allocation is at most 10% of initial supply (including dead allocations; its fraction of remaining supply can rise after burns) and vests linearly over 180 days after pool opening to the fixed recipient. An unsuccessful launch never starts vesting. After opening, extra WETH at the Vault may be swept only to the fixed treasury; official LP and the launch token are excluded from foreign-token recovery. Force-sent ETH is wrapped before treasury delivery.

The 2% fee goes to one fixed FeeSplitter. Splitter shares are 5000/1250/1250/2500: ecosystem reserve, 2027 reserve, XBT reserve, development/operations. The last recipient receives integer remainder. The first three shares of total gross are approximately 1%, 0.25%, 0.25%; development/operations approximately 0.5%, subject to wei rounding. No buyback, allocation checker, LP retirement or upgrade path is included.

## Configuration and security review

Factory limits include total supply <= uint112 max; LP allocation >= 1 whole token (1e18 wei); each round base allocation >=1 whole token; minCommit>=0.001 WETH; treasury<=10%; creator allocation<=10%; exactly five nonzero shares totaling 10000. Mainnet notice is at least 24h and each round/refund/settlement window at least 1h. Other existing upper bounds and metadata validation are enforced by source.

This candidate is self-reviewed, not independently audited. Static analysis and malicious callback behavior require independent review; this export includes contract tests but omits private execution logs. Release checks distinguish historical V15 manifests from versioned V15.1 artifacts. Passing finite EVM tests, dependency audit or bytecode comparison is not mainnet approval.

## Reproduction and authoritative evidence

Read `AUDITOR_PACK/README_SCOPE.md`, `RISKS.md`, `TEST_RESULTS.md`, `DECISIONS.md` and `DEPLOYMENT_RUNBOOK.md`. Use Node 24.22.1 and npm 12.2.1. Run `npm ci --ignore-scripts`, compile with pinned solc 0.8.38/IR/optimizer 1/Shanghai/metadata none, then the suites and candidate parity check. This review export includes source, tests, standard compiler inputs, ABI/creation/runtime templates and hashes. Git history and raw working logs are not included. Historical V15 artifacts are retained separately and do not define V15.1 rules.

## App deployment budget

The form accepts encoded SVG logo URIs up to 4096 bytes. The contract retains its 8192-byte upper bound; parameter validation does not guarantee that every combination fits the per-transaction gas cap. The app requires successful simulation and estimation within 16,777,216 gas before requesting a signature. GAS_BUDGET_REVIEW records maximum supported app-metadata measurements and the rejected larger case.
