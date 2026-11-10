# Maintainer notes

This repository is a V15.1 source review snapshot. README.md documents the
supported review workflow. Preserve all MIT licenses and Solidity SPDX headers.

Use pinned dependencies and compiler settings. After public documentation edits,
run `npm run content:sync`. After code changes, run the relevant tests and create
a new reviewed source revision; old checksums and test claims are no longer
current. Maintain a separate release process with full technical evidence.

No deployment or transfer is performed by the included review workflow.
Existing launches retain their deployed contract rules when new versions are
released. Review contract changes separately from interface and documentation
changes.
