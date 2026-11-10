#!/usr/bin/env bash
# Reproduce candidate evidence; open security gates remain a nonzero final exit.
set -euo pipefail
export NEXT_TELEMETRY_DISABLED=1
task_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$task_root"
test "$(node --version)" = v24.22.1
test "$(npm --version)" = 12.2.1
task_evidence="${1:-$task_root/contracts/runs/auditor-$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$task_evidence"
task_evidence="$(cd "$task_evidence" && pwd)"
record() { python3 "$task_root/scripts/record-command.py" "$task_evidence" "$@"; }
record install npm ci --ignore-scripts
record compile npm run compile -w @d17/contracts -- --force
record contracts npm run test:contracts
for suite in release-regressions release-100-lockers settlement-liveness runtime-bytecode-e2e release-plan-e2e adversarial-callbacks minimum-liquidity creation-gas-budget rounding-reference-model self-review-cross-launch; do
  (cd contracts && record "$suite" node "test/$suite.mjs")
done
(cd contracts && FUZZ_CAMPAIGNS=12 FUZZ_SEED=3354 record fuzz node test/fuzz-invariants.mjs)
record zod-research python3 scripts/reproduce-zod-review.py
record independent-solc npm run verify:candidate-build
record web-build npm run build
record production-http npm run test:production-http
record typecheck npm run typecheck
record api npm run test:api
record refresh-guard npm run test:guard
record activity-dedupe npm run test:activity-dedupe
record activity-history npm run test:activity-history
record launch-state npm run test:launch-state
record deployment-gas npm run test:deployment-gas
record read-provider npm run test:read-provider
record wallet-target npm run test:wallet-target
record candidate npm run check:candidate
record release-integrity npm run test:release-integrity
# Run every independent security/publication check even if another one fails.
set +e
record audit-production npm audit --omit=dev --json
prod_status=$?
record audit-full npm audit --json
audit_status=$?
record dependency-tree npm run check:dependency-tree
tree_status=$?
record versioned-release npm run check:release
release_status=$?
# Historical diagnostic remains deliberately non-authoritative after documented migration.
record historical-release npm run check:release:legacy
legacy_status=$?
(cd contracts && record slither slither . --compile-force-framework hardhat --hardhat-ignore-compile --json "$task_evidence/slither.json" --fail-high)
static_status=$?
set -e
printf 'Functional candidate checks completed. Gates: prod=%s audit=%s tree=%s release=%s legacy-diagnostic=%s static=%s. MAINNET NO-GO; independent audit and live evidence required.\n' "$prod_status" "$audit_status" "$tree_status" "$release_status" "$legacy_status" "$static_status"
test "$prod_status" -eq 0 && test "$audit_status" -eq 0 && test "$tree_status" -eq 0 && test "$release_status" -eq 0 && test "$static_status" -eq 0
