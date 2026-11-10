# Security

- Never put a private key or seed phrase in this project.
- `NEXT_PUBLIC_*` values are visible in the browser bundle. Use them only for public RPC URLs or client-safe configuration.
- A provider URL containing a paid credential is exposed to the local browser and should not be used in a public deployment without a server-side proxy.
- Confirm the chain name and factory address before signing.
- Mainnet transactions use real assets.

The deployer verifies the immutable D17 factory identity before simulation and signature, but users remain responsible for the RPC provider and wallet they choose.
