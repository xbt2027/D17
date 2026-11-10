# Progress

## 8 November 2026 — V15.1 candidate security work

Mainnet is not deployed. V15.1 preserves five rounds, pro-rata allocation, rollover and permanent LP. It returns failed-R1 principal and prior R1 penalties once, with no protocol deduction. Callers pay network gas separately.

The current candidate pins solc0.8.38. Local checks cover protocol accounting, adversarial callbacks, multiple concurrent launches, bounded settlement batches, runtime verification and release preparation. The developer has reviewed all92 unfiltered static-analysis records. Independent auditor acceptance remains pending; passing local checks is not a safety guarantee.

Successful launches require every final commitment to settle before pool opening. Owners can settle themselves; after grace anyone can pay gas to settle canonical positions. There is no guaranteed automatic keeper. The mainnet release policy fixes the2% protocol fee, four-recipient splitter and zero FeeConfig owner/pending owner before publication.

The publication tool now prepares candidate manifests only after fresh two-RPC verification of the exact source/build, receipts, dependency graph and owner freeze. Staging does not publish the website or authorize contributions.

## Historical Sepolia evidence

The repository retains a separate V15 Sepolia deployment and earlier lifecycle evidence at block11958083. Its1% fee settings, bytecode and addresses do not certify the V15.1 candidate. See [the historical deployment record](../release/deployments/sepolia.json) and [changelog](../CHANGELOG.md).

## Remaining release gates

- Independent audit, dispositions and retest of the exact current candidate.
- Final recipient/admin configuration and control evidence.
- Separate current-candidate Sepolia lifecycle, explorer and runtime proofs.
- Production domain/RPC setup and real wallet/browser checks.
- Review of the concrete mainnet transaction plan and separate user approval.

The10November target remains conditional. No deployment date or mainnet approval is implied by this page.
