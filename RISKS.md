# Known limitations

V15.1 is a review candidate, not an independently accepted production release.

- Independent audit and remediation retest are not established by this export.
- A signed public-testnet lifecycle for the exact candidate and production
  wallet/origin/RPC checks remain separate requirements.
- Very small pool-token allocations can create extreme opening-price and early
  sale risks. Permanent LP custody does not prevent WETH leaving through swaps.
- Complete settlement is required before pool creation. Permissionless settlement
  after grace still needs transaction submission and gas payment.
- Factory-accepted metadata can exceed practical deployment gas limits.
- Static analysis, dependency advisory applicability, and exact-release review
  must be evaluated on the final chosen source and environment.

Historical local tests do not establish universal safety or deployment approval.
