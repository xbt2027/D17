# Self-hosting D17

The repository supports two explicit read arrangements. Both serve the same
participant and deploy pages for Sepolia and Ethereum mainnet.

## Install

Requirements:

- For a reproducible release, Node.js 24.22.1 and npm 12.2.1 (matching CI).
- Other Node versions must satisfy the package engines; they are not this release verification baseline.
- A compatible HTTP JSON-RPC endpoint for each network you use.
- Optional WebSocket RPC endpoints for lower-latency updates.
- A browser wallet for transactions.

```bash
npm ci
cp apps/web/.env.example apps/web/.env.local
```

Populate only public endpoint values. Never put a seed phrase or private key in
the web environment.

## Direct RPC mode

Set `NEXT_PUBLIC_D17_DATA_MODE=rpc` and fill the Sepolia and/or mainnet RPC
values in `apps/web/.env.local`.

```bash
npm run dev:rpc
```

The browser reads factory logs and contract state from the selected endpoint.
No D17 server or external database is required. An RPC WebSocket improves
latency, while HTTP reconciliation covers first load, reconnects, and providers
without WebSockets.

## Optional indexed API mode

Copy and fill the two API profile examples:

```bash
cp apps/api/.env.sepolia.example apps/api/.env.sepolia
cp apps/api/.env.mainnet.example apps/api/.env.mainnet
```

Set `NEXT_PUBLIC_D17_DATA_MODE=api` in `apps/web/.env.local`, then run:

```bash
npm run dev:api
```

This starts separate Sepolia and mainnet API processes plus the web app. The API
builds one local JSON index per network and serves REST snapshots with
WebSocket notifications. It needs no external database, broker, wallet, or key.

The included store is intentionally single-process and single-writer. It suits
personal use, development, and modest showcase traffic; installations that
need distributed durability or horizontal scaling should replace the storage
layer while preserving the documented API contract.

API mode is useful for a shared viewer because one index performs broad log
reads and browsers receive compact D17-specific data. It also introduces a
public service that must be secured, monitored, rate-limited, and backed up.
See [the operations guide](../apps/api/OPERATIONS.md).

## Switching networks

Use `TESTNET | MAINNET` in the top navigation. The URL records the choice as
`?network=sepolia` or `?network=mainnet`. Switching performs a full page
navigation so old-chain sockets, providers, requests, and selected launch state
are discarded before the next profile loads.

## Transactions

Read mode never changes transaction custody. Commit, refund, settlement, pool
creation, withdrawal, and launch deployment transactions are signed by the
connected browser wallet and sent to the selected chain.

The deploy page uses the selected read RPC to check the chain and factory and
simulate `createLaunch` before the wallet prompt. The optional API is read-only
and does not receive private keys or submit transactions.

## Production notes

Build the web application with `npm run build`. If exposing the API publicly,
keep the Node processes on loopback, use an HTTPS reverse proxy, configure exact
CORS/WebSocket origins, and apply edge rate and connection limits. Do not treat
a browser-visible API token as a secret.
