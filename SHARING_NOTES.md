# Sharing export notes

Source candidate: `65fedfed290158a0dcd25acd73e5585d73ae0f33`.

This is a filtered source snapshot, not a byte-identical copy of the original
release archive. The original candidate commit remains a provenance reference;
a new Git repository made from these files will have a different commit hash.

## Included unchanged

All Solidity source files, contract test scripts, application transaction logic,
dependency lockfiles, compiler configuration, and archived ABI/bytecode artifacts.
The checksums of the Solidity source are recorded in
`release/v15.1/protocol-build.json`.

## Packaging changes

- Git bundles/history, internal execution evidence, and root promotional images were omitted.
- Internal coordination, decision quotations, and historical working notes were
  omitted or replaced with concise English technical descriptions.
- Account-specific repository and social links were removed. Public source links
  can be configured with `NEXT_PUBLIC_D17_REPOSITORY_URL`.
- The documentation bundle was regenerated from the included English documents.
- This export has a separate checksum manifest, `SHARING_SHA256SUMS.txt`.
- The enabled GitHub workflow runs review checks and tests. The original full
  release workflow is retained as a disabled reference, because its original
  history and evidence requirements are absent from this export.

No economic rules or Solidity implementation were changed for this export.
Full release validation and independent audit acceptance remain separate tasks.
