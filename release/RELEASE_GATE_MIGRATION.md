# V15.1 release integrity gate migration (31 October 2026)

Status: implemented locally, subject to independent review. MAINNET NO-GO.
Baseline for this change: 5f129572412062e0b21d3aa4276b707824107927.
No production Solidity or economics changed. Original failures remain in evidence/execution-directive-2026-10-30 and evidence/tempo-2026-10-31.

## Version distinction

The old checker asked current Solidity to match historical V15 hashes. Five of the fifteen sources legitimately changed for V15.1; all fifteen historical hashes match original V15 commit ce5ba32e49f87f1b6ae3b3ab11607517e91bf24a. Updating the old manifest from new code would silently overwrite historical Sepolia evidence. The old checker is preserved byte-for-byte as scripts/check-release-legacy.mjs, exposed as `check:release:legacy`, and still fails the historical/current-source comparison. It is an archival diagnostic after this explicit migration, not a passing test.

`check:release` is now the authoritative **V15.1 application integrity** gate. It is non-mutating and fail-closed. `verify` no longer runs a historical manifest generator. CI uses the pinned Node version, force-compiles current sources, reproduces candidate bytecode with direct solc and checks integrity without regenerating artifacts. Historical source verification requires full Git history (`fetch-depth: 0` or the supplied bundle). Hosted CI has not been run by Work.

## Obligation mapping

| Previous obligation | V15.1 enforcement |
|---|---|
| Four manifest copies / provenance | check-candidate-surfaces verifies every chain/address field and explicit protocol versions |
| Website content matches public docs | check-candidate-surfaces calls the same content builder |
| Historical ABI mirrors | check-historical-v15 pins all 48 ABI/artifact files plus three build/checksum files to original V15 |
| Current source hash / ABI / bytecode | export-candidate --check loads exact current source/build input/output and compares all 51 generated candidate files |
| Historical source checksums | all 15 historical source hashes and original standard input verified against original Git baseline |
| No secret env / personal data | release-inventory scans every text byte in application delivery, retains prior patterns, rejects env files except examples and rejects symlinks |
| Exact file inventory / digest | release/v15.1/RELEASE_SHA256SUMS.txt covers exact application delivery including previously excluded versioned artifacts; unexpected/untracked public files fail |
| Historical readable ABI explorer | check:explorer remains in CI against preserved V15 ABIs; it is not a V15.1 explorer claim |
| Relative doc links | check-doc-links remains mandatory |
| Compiler reproduction | verify:candidate-build independently recompiles with locked solc; mandatory CI/reproduction step |

## Inventory boundaries

Application scope: `.github`, apps, contracts, deployments, docs, operations, release, scripts and the explicit root package/license/readme/security/verification files and two public images listed in scripts/release-inventory.mjs. This is a **declared scope change** from the old filesystem-wide manifest. Audit reports, raw evidence, coordination and root progress/decision documents remain in Git and are covered by the complete checkpoint archive hashes. They are not web publication content and are not covered by the application's personal-data scan. Never publish the auditor archive as the website.

Transient dependency/output folders are excluded: node_modules, .next, .vercel, contracts/artifacts, contracts/cache, contracts/runs, apps/api/data, .DS_Store and TypeScript incremental caches. An arbitrary folder called artifacts outside contracts/artifacts is **not** excluded. Application symlinks, missing scope roots and non-example env files are rejected. The inventory itself is the only application checksum self-exclusion. Root RELEASE_SHA256SUMS.txt is retained as historical evidence; it is not regenerated or used to attest today's tree.

Run all mutating build/content steps before `release:checksums`; verification compares canonical checksum text and cannot silently refresh it. Checkpoint verification separately requires a clean committed tree and a complete Git archive/bundle.

## Negative tests and remaining gates

`test:release-integrity` covers changed source/bytecode, added and deleted files, duplicate checksum lines, an unexpected artifacts directory, ignored env files, symlink escape, a secret after two million bytes, a missing root, root environment files and separately scoped evidence. End-to-end candidate checks also reject stale inputs/artifacts and mismatched versions.

Passing integrity is not independent security closure. The full dependency audit, dependency tree, Slither review, real P0-D addresses/admin policy, final-bytecode Sepolia lifecycle, final frozen ownership/runtime evidence and production wallet checks remain mandatory. The reproduction wrapper records legacy failure but does not use it as the V15.1 gate; it still exits nonzero for unresolved security gates. No scanner suppression, Zod major override, risk waiver or economic change is introduced by this migration.
