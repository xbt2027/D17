# D17 V15.1 - developer review export

This is an English-language source snapshot based on candidate
`65fedfed290158a0dcd25acd73e5585d73ae0f33`. It is prepared for source review and a
new repository. It is not the original release archive or a mainnet approval.

## Contents

- Solidity source, interfaces, test contracts, and contract test scripts.
- Web application, optional API, application tests, and public documentation.
- Dependency lockfiles, compiler configuration, ABIs, and build inputs.
- Historical V15 deployment manifests, clearly separate from V15.1 artifacts.
- An English review guide and a checksum manifest for this export.

The contract source and contract tests are unchanged from the source candidate.
Git history, internal coordination, raw execution logs, and account-specific
links are not included. Documentation and public source-link presentation were
adapted for this export. See [SHARING_NOTES.md](./SHARING_NOTES.md).

## Local review

Use Node.js 24.22.1 and npm 12.2.1, matching the recorded candidate environment.
From this directory:

```bash
npm install --global npm@12.2.1 --ignore-scripts
npm ci --ignore-scripts
node scripts/verify-sharing.mjs
npm run compile -w @d17/contracts -- --force
npm test
npm run build
```

The dependency lockfiles remain pinned to the source candidate. Availability of
those exact packages is required. This export does not claim that the full
contract suite or a new deployment was executed while preparing it.

To reproduce the archived candidate bytecode after compilation:

```bash
npm run verify:candidate-build
```

To start the local web interface, copy `apps/web/.env.example` to
`apps/web/.env.local`, supply the intended public RPC configuration, and run
`npm run dev:rpc`. The optional `NEXT_PUBLIC_D17_REPOSITORY_URL` setting controls
public source links. It contains no preset account or repository owner.

## Review entry points

- [Review scope](./AUDITOR_PACK/README_SCOPE.md)
- [Original V15 findings](./AUDITOR_PACK/V15_FINDINGS.md)
- [Current technical rules](./docs/CONTRACTS_TECHNICAL.md)
- [Known limitations](./RISKS.md)
- [Verification notes](./VERIFICATION.md)
- [GitHub publishing](./GITHUB_SETUP.md)

## Release status

V15.1 remains a candidate. The archived Sepolia manifests describe historical
V15; they do not establish a deployment of this candidate. Independent audit
acceptance, the exact-candidate public testnet lifecycle, production wallet/RPC
verification, and final release authorization are not established by this ZIP.

The original release and deployment tools remain available for inspection.
Their full-history and original-archive checks are not replaced by this export's
checksum check. This package is not a shortcut around release requirements.

## License

MIT. Copyright (c) 2026 D17 contributors. Existing license files and Solidity
SPDX headers are preserved.
