#!/usr/bin/env python3
"""Reproduce 8 Nov developer dispositions without suppressing any raw finding."""
import collections,csv,hashlib,json
from pathlib import Path
raw=Path('evidence/security-closeout-2026-11-08/slither.json')
items=json.loads(raw.read_text())['results']['detectors']
notes={
'030cf9e2ae':('Intentional token preseed rejection. Before opening, D17Token permits launch transfers and vault-to-canonical-pair only; holders cannot seed the pair. WETH-only donations are permitted and cannot mint donor LP. Noncanonical token/router assumptions must not be substituted.','adversarial-callbacks; minimum-liquidity; self-review-cross-launch'),
'033661cef5':('All external settlement routes enter Locker nonReentrant. Canonical Launch also guards claims and has no receiver hooks; local consumption precedes outgoing WETH transfers. Reverts roll back both ledgers. Intermediate views are not general-purpose composable price oracles.','adversarial-callbacks; release-regressions; self-review-cross-launch'),
'391e66b4c1':('Pool creation is nonReentrant; claim/mint/transfer use fixed Launch, D17Token, WETH and V2 pair. OfficialPair/counters updated after mint cannot be reentered through another guarded Vault entry. Dependency identity is mandatory; arbitrary routers are not safe by inference.','adversarial-callbacks; minimum-liquidity; runtime-bytecode-e2e'),
'f6fea7a3e1':('Locker refund is owner-only and nonReentrant. Canonical Launch releases accounting without sending ETH to the owner; local accounting is updated before penalty WETH transfer. Repeated round refund is rejected.','adversarial-callbacks; failed-refund-remediation; self-review-cross-launch'),
'04a962ca25':('Scalar bool is false at each loop entry, becomes true only after a successful bounded canonical settlement call. Invalid/failed target cannot inherit a previous success. Mixed valid/duplicate/invalid batch exercises isolation.','settlement-liveness'),
'180fc54188':('uint256 accumulator starts at zero for each settlement, sums only retained per-round commitment once across five fixed rounds. Checked arithmetic and consumed positions protect repeats.','rounding-reference-model; self-review-cross-launch'),
'20dd819c72':('uint256 accumulator starts at zero, sums five canonical preview entitlements, then reconciles claim result before committing local token entitlement.','release-regressions; self-review-cross-launch'),
'2c88ade9a2':('uint256 scalar starts at zero; exactly five uint16 shares are added and total must equal 10000. No storage reference or uninitialized pointer.','hardening-e2e; mainnet-floors-e2e'),
'87c5703f5a':('uint256 starts at zero, sums only unconsumed commitments and original penalty entitlement, not prior withdrawals. Shared accounting updated atomically; repeated failure refund rejected.','failed-refund-remediation; self-review-cross-launch'),
'a2c51b4139':('paid starts at zero per distribution. Earlier recipient amounts accumulate and last receives balance-paid, preserving all rounding dust. Recipient count <=5 and shares sum10000.','fee-splitter-e2e; release-regressions'),
'b14616efbb':('uint256 total starts at zero; bounded nonzero unique recipient shares must sum10000. Constructor reverts atomically on invalid array.','fee-splitter-e2e'),
'b758be3984':('uint256 share sum starts at zero in constructor; five nonzero round shares must total10000, repeated validation at canonical factory and launch.','hardening-e2e; mainnet-floors-e2e'),
'819c27fb2b':('Batch success means a settlement call completed, even if pro-rata token amount rounds to zero. WETH/fees must still settle in that case. Returned token amount is intentionally not a success predicate.','release-regressions; settlement-liveness'),
'd9fb3d6811':('Reserve timestamp is unused intentionally: _pairReserves sorts asset quantities, does not implement a time-weighted price oracle or use reserves to price claims.','minimum-liquidity; adversarial-callbacks'),
'34c0326cec':('transferOwnership(0) cancels pending nomination while preserving current owner. acceptOwnership requires caller==pendingOwner; zero cannot call. Actual freeze uses renounceOwnership, clearing both owner fields. This cancellation behavior is retained.','source: D17FeeConfig.transferOwnership/acceptOwnership/renounceOwnership; release-plan-e2e'),
'4036ae918f':('At most eight registry STATICCALLs per batch against fixed canonical factory; no participant-count loop. Global clearing still requires somebody to submit/pay batches.','settlement-liveness'),
'4e359ee090':('At most eight calls with explicit 1M subcall budget and EIP150 precheck, per-target try/catch. Single-position entry remains available. Aggregate Sybil settlement cost is not bounded by one transaction.','settlement-liveness'),
'e858ca0a40':('Five-round constant bound on canonical read-only Launch previews; no user-supplied array or recursive callback target.','self-review-cross-launch; release-100-lockers'),
'e9e3e5c4fc':('Same five-round canonical STATICCALL path seen through another caller; bounded iteration and no user-defined callbacks.','self-review-cross-launch; release-100-lockers'),
'02d1526f80':('All public paths reaching finalization are guarded. finalized flag precedes burns; canonical D17Token.burn has no external receiver hook. Informational burn-complete counter follows successful burn; failure reverts all.','release-regressions; self-review-cross-launch'),
'0c3f2636a9':('Create has no generic reentrancy modifier; safety relies on immutable pinned factory family. Canonical constructors/configuration/minting have no user callback, owner graph frozen before use. Do not generalize to arbitrary upgradeable factories.','runtime-bytecode-e2e; release-plan-e2e; source: D17LaunchFactory.deployLaunch'),
'19da8eccf1':('Launch claim entry is guarded; _finalizeLaunch touches only canonical burn implementation. Settled flag/aggregate effects occur once, then caller transfers funds; nested mutation is blocked.','release-regressions; self-review-cross-launch'),
'1dafe4212e':('Locker settlement guard covers the complete cross-contract sequence. Local entitlement then accountedWeth reduction precede actual WETH sends; any downstream error reverts all effects.','adversarial-callbacks; self-review-cross-launch'),
'2885112ee1':('Vault guard covers createOfficialPool and other mutating Vault routes; canonical pair mint has no recipient callback. Post-mint accounting only survives successful full transaction.','adversarial-callbacks; minimum-liquidity'),
'31a7032ba2':('onlyVault and nonReentrant protect liquidity claim, including finalization. Flag and allocation effects are set before canonical token transfer, which does not call recipient.','release-regressions; self-review-cross-launch'),
'3c653bd298':('Canonical Launch accounting call occurs under Locker guard. Later local refund/penalty counters and WETH transfer are atomic; callback entry cannot reuse the position.','adversarial-callbacks; self-review-cross-launch'),
'06229426d3':('Creation event follows deterministic canonical deployment/registry writes. No user hook in pinned deployment graph can interleave an unrelated creation; off-chain consumers must verify canonical registry.','runtime-bytecode-e2e; release-plan-e2e'),
'7416ac5564':('Per-target result event deliberately follows call; failure emits false. Target must be canonical registered Locker; each Locker guard blocks its own nested settlement. Consumer must read explicit locker+success.','settlement-liveness'),
'f4e12c0b7c':('New Locker constructor only stores validated owner/dependency; fixed Factory.registerLocker updates registry and has no owner callback. Event after registration records the created object.','local-e2e; source: D17Locker constructor and D17Factory.registerLocker'),
'3393383cad':('Memory-safe assembly CREATE consumes allocated initCode bytes with zero value. Prefix is type(D17Launch).creationCode, ABI params supplied only by pinned LaunchFactory, second word validates vault configurator. Failed create must revert.','runtime-bytecode-e2e; release-plan-e2e; direct-solc'),
'95010c4902':('Detector flags the embedded type(D17Launch).creationCode literal, not an economic constant or fee share. CREATE input and zero-result check reviewed; no user-controlled arbitrary creation-code prefix.','source: D17LaunchDeployer.deployLaunch; runtime-bytecode-e2e'),
'01c595a739':('Native excess recovery requires onlyOwner and nonReentrant; sends requested balance to owner-chosen recipient and checks success. It cannot extract accounted WETH. Forced ETH is not an additional participant entitlement.','hardening-e2e; source: D17Locker.recoverNativeEth'),
'dbd216e7f9':('balanceOf uses STATICCALL and requires success plus >=32 return bytes. Canonical WETH fixed at deployment. Arbitrary token distribution is convenience and does not imply support for adversarial rebasing/taxed assets.','fee-splitter-e2e; adversarial-callbacks'),
'3cf4b5c995':('Uppercase function matches public constant getter ABI used for contract family identity; renaming breaks callers. ABI equality retained across compiler change.','runtime-bytecode-e2e; compiler-comparison.json'),
}
timestamp={
'11d2821ea8':'Round starts inclusive, ends exclusive; fixed mainnet >=1h windows, no timestamp randomness.',
'38ae84f327':'Finalization after final round end; user cannot finalize during active round.',
'39214bede4':'Four non-overlapping refund windows; no R5 refund window; exact time boundaries are deterministic.',
'4352e13d9a':'Pool claim requires settlement/grace time plus every final commitment settled; elapsed time alone is insufficient.',
'43fa8f4bc8':'Pool deadline and grace compare chain time; user deadline protects stale calls, not price.',
'4e31a2a045':'Creator release depends on linear vested amount and alreadyReleased; fixed recipient, no timestamp randomness.',
'4f27d6d3ea':'Failure starts after R1 refund window only if no valid anchor; successful R1 cannot become a failed later round.',
'85e33f66c4':'Display phase derives from the same immutable window times; contract execution remains authoritative.',
'b24bb16a5b':'Vesting is linear over180days after actual pool opening, capped at allocation. Timestamp granularity can shift release marginally.',
'bf4cc2e968':'Permissionless settlement begins after grace; ownership bypass only changes who pays gas, not entitlement recipient.',
'bf4e565ea4':'Mainnet notice>=24h and windows>=1h; timestamp cannot be treated as exact wall-clock or inclusion guarantee.',
'deef21fde8':'Constructor repeats future-start/window checks; mainnet factory applies stricter floors.',
'e0ae6a41df':'One-shot gate stores future schedule; actual tradingOpen delegates to Launch pool-created status, not just this timestamp.',
'ed8f9f0555':'Round claim time is after corresponding refund opportunity; no entropy/randomness derived from time.'}
rows=[]
for d in items:
 key=d['id'][:10];paths=sorted({e['source_mapping'].get('filename_relative','') for e in d['elements'] if 'source_mapping'in e})
 scope='test-only' if paths and all('/test/' in p for p in paths) else 'production-or-mixed'
 if scope=='test-only':
  if 'CallbackWETH' in d['description']:note='Hostile fixture deliberately exposes arbitrary call/reentry configuration and revert forwarding to probe production guards; not a production WETH implementation.'
  elif 'TestV2Pair' in d['description']:note='Simplified unguarded Pair fixture is not safe for production: no V2 invariant/lock assurance. Security-sensitive donation/LP suites separately use pinned real Uniswap V2 bytecode.'
  elif 'TestWETH' in d['description']:note='Local WETH fixture burns balance before native callback; supports test funding only. Production dependency must be canonical independently verified WETH.'
  else:note='Local router fixture uses deadline/reserve quantities; unused timestamp is not a TWAP. Production plan verifies actual immutable router/factory identities.'
  evidence='contracts/contracts/test; adversarial-callbacks; minimum-liquidity; runtime-bytecode-e2e';status='TEST_FIXTURE_NOT_RELEASED'
 elif key in notes:note,evidence=notes[key];status='REVIEWED_WITH_STATED_ASSUMPTIONS'
 elif key in timestamp:
  note=timestamp[key]+' Block producers/inclusion delays can affect edge timing; no exact wall-clock guarantee.';evidence='local-e2e; hardening-e2e; mainnet-floors-e2e; release-regressions';status='REVIEWED_WITH_STATED_ASSUMPTIONS'
 elif d['check']=='low-level-calls':
  note='Safe-transfer helper requires successful call and either empty return or true bool. Canonical token/WETH callers have verified code; helper alone does not reject an EOA and is not a universal token safety check. Approval helper has no active production caller in this source.';evidence='source: contracts/lib/D17SafeTransfer.sol; adversarial-callbacks; runtime-bytecode-e2e';status='REVIEWED_WITH_STATED_ASSUMPTIONS'
 elif d['check']=='missing-inheritance':
  note='Structural ABI implementation matches consumer selector without explicit inheritance. No extra access-control behavior exists in the interface. Test-only interface suggestion is not a production dependency requirement; runtime identity still verified separately.';evidence='source: cited implementation and interface; runtime-bytecode-e2e; direct-solc';status='REVIEWED_NO_CHANGE'
 elif d['check']=='cache-array-length':
  note='Metadata link loop length bounded to eight by canonical factory and metadata is configured once. Compiler caching is optional gas optimization; not a security defect. Unsupported direct token deployment is outside canonical registry.';evidence='source: D17Factory._validateMetadata and D17Token metadata functions; creation-gas-budget';status='REVIEWED_NO_CHANGE'
 elif d['check']=='constable-states':
  note='Legacy late-settlement/failed-burn counters intentionally remain zero under V15.1; legacy mutation methods revert. Kept for ABI/storage compatibility, UI selects V15.1 semantics. Changing to constant is optional, not required to protect funds.';evidence='release-regressions; failed-refund-remediation; test-launch-state';status='REVIEWED_NO_CHANGE'
 else:raise RuntimeError('UNREVIEWED '+key+' '+d['check'])
 rows.append(dict(id=d['id'],detector=d['check'],impact=d['impact'],confidence=d['confidence'],scope=scope,paths=';'.join(paths),description=d['description'].strip(),developer_assessment=note,developer_status=status,evidence=evidence,independent_status='PENDING'))
assert len(rows)==92 and len({r['id'] for r in rows})==92
with open('AUDITOR_PACK/STATIC_FINDINGS.csv','w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');w.writeheader();w.writerows(rows)
summary={'raw_sha256':hashlib.sha256(raw.read_bytes()).hexdigest(),'total':len(rows),'developer_reviewed':len(rows),'independent_acceptance':'PENDING','raw_fail_high_exit':255,'counts':{scope:dict(collections.Counter(r['impact'] for r in rows if r['scope']==scope)) for scope in {'production-or-mixed','test-only'}},'mainnet':'NO-GO'}
Path('evidence/security-closeout-2026-11-08/static-review-summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary))
