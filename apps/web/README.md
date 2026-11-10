# D17 Web Application

The D17 web application contains the participant terminal and launch deployer
for both Sepolia and Ethereum mainnet. The `TESTNET | MAINNET` control selects
the active public deployment without requiring separate builds or repositories.

## Requirements

- Node.js 22.13 LTS or Node.js 24+.
- An HTTP JSON-RPC endpoint for every network you intend to use.
- An optional WebSocket RPC endpoint for lower-latency direct-RPC reads.
- A browser wallet for transactions.

Install dependencies from the repository root:

```bash
npm ci
cp apps/web/.env.example apps/web/.env.local
```

Never put a private key or seed phrase in a `NEXT_PUBLIC_*` variable. Every
such value is included in the browser bundle.

## Direct RPC mode

Set `NEXT_PUBLIC_D17_DATA_MODE=rpc`, fill the selected network RPC values, and
run:

```bash
npm run dev:rpc
```

The browser discovers launches from factory events and reads contract state
directly. An RPC WebSocket improves latency when available; HTTP snapshots and
reconciliation cover initial load, reconnects, and providers without sockets.
No D17 API is required.

## Optional API mode

Run the included API profiles, set `NEXT_PUBLIC_D17_DATA_MODE=api`, then run:

```bash
npm run api:all
npm run web:api
```

API mode loads a complete REST snapshot before subscribing to WebSocket
notifications. Low-frequency API reconciliation covers missed messages and
backgrounded tabs. Display reads do not silently fall back to Ethereum RPC.

The deploy page still uses the selected read RPC to verify the chain and
factory and to simulate `createLaunch` before asking the wallet to sign. The
signed transaction goes from the wallet to the selected chain; the API never
receives a key and never submits a launch.

## Routes and networks

- `/` - participant terminal.
- `/deploy` - launch deployer.
- `?network=sepolia` - Sepolia deployment.
- `?network=mainnet` - Ethereum mainnet deployment.

Changing networks performs a full document navigation. This deliberately
closes the previous chain's providers, sockets, timers, requests, and selected
launch state before the other network initializes. Internal links preserve the
selected network, and API responses are rejected if their chain ID differs.

## Public deployment data

`deployments/`, `lib/d17Manifest.ts`, and `public/abi/` contain the public
factory manifests and contract interfaces for both networks. A build for a
different factory suite should replace and re-verify those manifests rather
than overriding transaction targets at runtime.

## Commands

```bash
npm run typecheck
npm run build
npm run test:rpc -w @d17/web
```

The RPC smoke test requires `RPC_URL` and optionally `NETWORK=mainnet` or `CHAIN_ID=1`.
Review every wallet transaction independently. Mainnet uses real assets.
