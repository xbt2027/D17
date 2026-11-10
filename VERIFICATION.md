# Review verification

Run `node scripts/verify-sharing.mjs` before editing the export. It checks the
complete sharing inventory and the Solidity hashes in the candidate build record.
Run `npm run check:docs` and `npm run content:sync -- --check` for documentation.
Use README.md for compilation, contract/application tests, and candidate parity.

The original `check:release`, release export, and publication checks remain
available for review. They expect the original release context, inventory and
history, which this sharing snapshot does not supply. Do not interpret an export
checksum check as replacing them or as authorizing deployment.
