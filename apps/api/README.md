# D17 Optional Read API

This package is a provider-neutral RPC indexer and read-only API for the D17
web application. It reads public contract events from an Ethereum JSON-RPC
endpoint, stores a local JSON index, and serves REST snapshots plus WebSocket
notifications.

The API is optional. The web application can instead read both networks
directly from RPC endpoints. The API requires no wallet key and signs no
transactions.

## Data flow

```text
HTTP RPC catch-up + optional WebSocket logs
                    |
                    v
              D17 event reducer
                    |
                    v
       one local state file per network
                    |
                    v
            REST + WebSocket API
```

No external database, message broker, or proprietary service is required.

This is intentionally a small, single-process reference backend. Its JSON
state grows with indexed D17 lifecycle activity and it does not provide
multi-writer coordination, horizontal scaling, or distributed durability. It
is a practical fit for a personal node, development environment, or modest
public showcase. Larger installations should preserve the API contract while
replacing the storage and rate-limiting layers with infrastructure sized for
their traffic and retention requirements.

## Quick start

Requirements: Node.js 22.13 LTS or Node.js 24+ and compatible HTTP RPC endpoints.
WebSocket RPC endpoints are recommended for lower-latency updates.

From the repository root:

```bash
cp apps/api/.env.sepolia.example apps/api/.env.sepolia
cp apps/api/.env.mainnet.example apps/api/.env.mainnet
# Fill RPC_URL and optional WS_URL in each file.
npm run api:all
```

The default profile endpoints are:

- Sepolia: `http://127.0.0.1:8787/api/health`
- Mainnet: `http://127.0.0.1:8788/api/health`

Run only one profile with `npm run api:sepolia` or `npm run api:mainnet`.
Each profile has a fixed expected chain, deployment manifest, port, state file,
and logo directory. A mismatched manifest or existing state file fails closed.

## Realtime model

- WebSocket log subscriptions are primary when configured.
- HTTP `eth_getLogs` performs initial catch-up, reconnect repair, reorg
  lookback, and periodic safety reconciliation.
- REST is the complete snapshot used on first load and reconnect.
- API WebSocket messages are notifications, not a durable replay log.
- Pair contracts are not watched by default.
- `Swap`, `Sync`, `Transfer`, and `Approval` are excluded from ingestion.
- D17 lifecycle and liquidity events remain indexed.
- `RPC_MAX_REQUESTS_PER_SECOND` bounds RPC work.

For HTTP-only operation, leave `WS_URL` empty and set
`INDEX_SOURCE_MODE=http-poll`.

## API surface

- `GET /api/health`
- `GET /api/deployer/schema`
- `GET /api/launches`
- `GET /api/launches/:launch`
- `GET /api/launches/:launch/metadata`
- `GET /api/launches/:launch/phase`
- `GET /api/launches/:launch/activity`
- `GET /api/launches/:launch/lockers`
- `GET /api/launches/:launch/lockers/:locker`
- `GET /api/assets/logos/:token.svg`
- `GET /api/prices/eth-usd` when enabled
- `GET /api/stream?launch=0x...`
- `WS /api/ws?launch=0x...`

Amounts are decimal strings in contract units. REST responses use an `ok`,
`data`, `error`, and `meta` envelope. Clients must validate `meta.chainId`.

`/api/deployer/schema` publishes the selected factory ABI, addresses, and
validation limits. Launch transactions are still simulated through the
selected RPC and signed by the browser wallet; the API has no write endpoint.

## Optional ETH/USD display price

Set `USD_PRICING_ENABLED=1`. Mainnet can use its configured RPC; Sepolia can
use a separate mainnet endpoint in `USD_PRICE_RPC_URL`. The cached result is
display-only, carries freshness metadata, and never enters contract math or a
transaction.

## Public exposure

The reference server provides in-process IP request limits, global connection
caps, HTTP method restrictions, HTTP/WebSocket origin checks, bounded client
payloads, and conservative proxy-header handling. These controls are suitable
for a small self-hosted instance, not a substitute for an HTTPS reverse proxy
and edge-level abuse controls.

Set an explicit `CORS_ALLOWED_ORIGINS`, retain the rate and connection limits,
and leave `TRUST_PROXY_HEADERS=0` unless requests arrive through a proxy you
control. Do not embed a permanent API secret in browser JavaScript; it is not
secret once bundled.

See [OPERATIONS.md](./OPERATIONS.md) for RPC requirements, state isolation,
backups, health checks, and deployment guidance.
