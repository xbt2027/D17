# ND-002 — Sepolia unsigned execution template

**NO-GO; no signature authorization.** Exact candidate commit: outer CHECKPOINT.json; chain ID11155111. Existing deployed Sepolia is historical V15 and remains intact. Use a separate V15.1 deployment record after successful rehearsal. Missing public inputs prevent concrete live addresses/calldata; never insert test Hardhat accounts or placeholder addresses.

## Inputs needed to concretize
User-controlled three deployer roles (may share EOA), their confirmed nonces, fee-admin contract address and reviewed Safe configuration, four distinct TEST recipient addresses in economic order; Sepolia read RPC plus independently operated comparison RPC; reviewed WETH/router/factory addresses and runtime hashes. No private keys. Validate router.factory(), chain, provider block agreement and account code. Exact CREATE addresses become deterministically calculable only after nonces and deployment actors are supplied.

## Unsigned plan generation
From the exact clean checkout, use Node 24.22.1, npm 12.2.1 and the locked install. Build and run check:candidate. In contracts directory:

```sh
node scripts/prepare-release.mjs --mode build-manifest --out runs/release/build-manifest.json
node scripts/prepare-release.mjs --mode plan --policy ../operations/release-policy.sepolia.json --out runs/release/sepolia-plan.json
```

The checked-in template deliberately has null addresses, commit and hashes and MUST FAIL. Make a separately reviewed filled policy after the audited commit is fixed; keep confidential RPC tokens out of it. buildManifestSha256 is the EIGHT-suite manifest above, not the 12-contract candidate manifest. Policy sourceCommit must equal clean HEAD in every live verification mode.

The plan contains eight creations + five pins, zero tx value for each, full creation/calldata, chainId/from/nonce/predicted address/constructor args and plan SHA256. Historical gas figures are superseded by the final candidate's release-plan and runtime EVM reports. Read their per-transaction gas values from the current evidence package. These are gas units, not a live ETH quote; estimate each concrete live tx and current fee separately. Test ETH for lifecycle commits is separate from these zero-value deployments.

## User wallet review, after explicit approval
Check11155111, exact from, nonce, to/create address, value, calldata/constructor hash, maxFee/maxPriority/gasLimit<=16777216, reviewed artifact fingerprint and plan digest. Any intervening deployer tx invalidates CREATE predictions; regenerate plan. Stop after pins. Store all tx hashes keyed by the plan's transaction IDs in receipts.transactions. Wait at least12 confirmations per policy.

```sh
node scripts/prepare-release.mjs --mode verify-pre-freeze --plan runs/release/sepolia-plan.json --receipts runs/release/receipts.json
node scripts/prepare-release.mjs --mode prepare-freeze --plan runs/release/sepolia-plan.json --receipts runs/release/receipts.json
```

Set RPC_URL securely in the process, never in shared logs. These commands read RPC and emit unsigned data; no signer. Repeat with a second provider. User must separately approve irreversible testnet renounces. Sign only the next approved call. Add its hash to receipts.freezeTransactions under the contract name; rerun verify-freeze-progress and prepare-freeze to verify completed ordered prefix and emit ONLY remaining calls. Final verify-frozen requires all5 receipts and zero owners. Safe threshold/owners/modules/guards remain separately reviewed; runtime verification of D17 does not certify Safe internals.

## Rehearsal acceptance
Create candidate launch; measure ordinary and metadata-heavy gas with actual provider; verify rulesHash/fee snapshot. Exercise five rounds, top-up, R1 minimum/anchor success+failure, early/later refunds, vesting start, all-final settlement gate, duplicate/invalid/late batches and unavailable-owner direct path. Specifically test failed R1 after an early net99% withdrawal: only the missing1% can be reclaimed, once; donation WETH must not become an entitlement, no D17/treasury/dead payment, and unlock then WETH withdrawal must match the UI. Record conservation, 2% fee split, pool reserves/LP lock, buy+sell, claim/refund rights and leftover dust. Mainnet minimum24h notice/1h windows are locally tested; Sepolia shorter windows may accelerate lifecycle, but cannot fake180-day live elapsed vesting—pair local time-travel evidence with actual immutable parameters and disclose the limit.

Save actual block timestamps, receipts, explorer verified source/runtime, web wallet network/account-change checks and all failure logs. startBlock must come from the real Factory deployment receipt; public manifest gets exact addresses only after proof, never0/guessed. Any failed/high finding remains NO-GO; rerun changed-code tests and auditor remediation before final freeze. This template is preparation only, not a completed Sepolia rehearsal or a concrete signable live plan.
