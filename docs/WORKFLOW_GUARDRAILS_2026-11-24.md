# D17 workflow guardrails — documentation only

## Audit snapshot
The main README identifies this repository as a **V15.1 developer review export**, not an approved mainnet release. Existing .github/workflows/ci.yml runs source-sharing checks, pinned Node/npm installation, contract compilation, tests, build, candidate-build verification and documentation checks. Preserve these safeguards.

## Scope
- V15.1 source snapshot, deployment facts and V16 research/changes must not be conflated.
- Before any proposed V16 change, record exact base commit, deployed-reference contract addresses, specification decision ID, behavioral difference, failure-mode analysis, and test plan.
- Use a dedicated branch and draft PR; do not modify mainnet deployment manifests, production contracts, wallets, DNS, or sites as part of workflow optimization.
- Require independent contract security review, regression/invariant tests, deterministic build evidence, and auditor signoff as separate gates. Never claim that self-audit replaces external audit.
- Refund and fee semantics are decision-controlled; no changes by inference from old discussions.
- Record owner decisions as explicit issues; avoid silent requirement changes.

## Review status vocabulary
PROPOSED / SPECIFIED / IMPLEMENTED / TESTED / INDEPENDENTLY REVIEWED / APPROVED FOR RELEASE. A successful build is not approval to deploy.

## Weekly reporting
Last verified commit; open critical issues; reproducible test results; decisions needed; external audit status; deployment readiness blockers. Do not fabricate progress metrics.
