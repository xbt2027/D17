# Security

## Reporting

Do not publish an unpatched vulnerability with a working exploit against a live
deployment. Report it privately to the repository maintainer with the affected
contract or component, reproduction steps and likely impact.

## Trust boundaries

- The web application never requires a private key or seed phrase.
- The optional API is read-only and never signs transactions.
- Wallet actions are submitted directly to the selected Ethereum network.
- RPC and API endpoints are untrusted inputs and are chain-checked where they
  can affect display or deployment simulation.
- Mainnet deployment and interaction use real assets.

## Self-hosting

Keep environment files out of Git, use explicit CORS origins for public APIs,
retain request and connection limits, and place Internet-facing services behind
TLS. Review [API operations](./apps/api/OPERATIONS.md) before public exposure.

