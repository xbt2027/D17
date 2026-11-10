# Operating The D17 Read API

The API is a small, provider-neutral reference indexer. It requires no wallet,
holds no private key, and signs no transaction.

## Network profiles

Sepolia and mainnet run as separate processes from the same source:

| Profile | Chain | Port | Manifest | State |
|---|---:|---:|---|---|
| `sepolia` | 11155111 | 8787 | `deployments/sepolia.json` | `data/state-sepolia.json` |
| `mainnet` | 1 | 8788 | `deployments/mainnet.json` | `data/state-mainnet.json` |

Create `.env.sepolia` and `.env.mainnet` from the examples. The profile runner
checks that the manifest and any existing state file have the expected chain
ID. `npm run api:all` also requires distinct ports, state paths, and logo
directories.

## RPC requirements

Any standards-compatible Ethereum JSON-RPC endpoint can be used. Required
methods include:

- `eth_chainId`
- `eth_blockNumber`
- `eth_getBlockByNumber`
- `eth_getCode`
- `eth_getLogs`
- `eth_call`

A WebSocket endpoint should support `newHeads` and log subscriptions. Without
one, set `INDEX_SOURCE_MODE=http-poll` and leave `WS_URL` empty. HTTP log reads
still handle initial catch-up, reconnect gaps, reorg lookback, and safety
reconciliation when WebSocket mode is active.

Provider limits vary. Reduce `LOG_CHUNK_SIZE` when broad `eth_getLogs` requests
are rejected and set `RPC_MAX_REQUESTS_PER_SECOND` below the provider's limit.
Indexing starts at the public deployment block, not genesis, so the provider
must permit historical logs from that block.

## State and backup

Each network's complete index is stored in its own JSON file. Keep `data/` on
persistent storage. Stop the relevant process before copying a state file, then
validate the restored state with the package check command.

Run exactly one writer for each state file. The reference store has no
multi-process locking or distributed replication, and its disk footprint grows
with retained lifecycle events. Monitor file size and free space, keep tested
backups, and use an external database implementation behind the same API
contract if the installation needs multiple writers, horizontal scaling, or
high-volume retention.

For a clean rebuild, stop the profile, move its old state file aside, and start
it again. Never point both profiles at the same state file.

## Public exposure

The process binds to `127.0.0.1` by default. Keep that binding and place an
HTTPS reverse proxy in front of it. Configure:

- an explicit comma-separated `CORS_ALLOWED_ORIGINS` list;
- `HTTP_RATE_LIMIT_MAX` and `HTTP_RATE_LIMIT_WINDOW_MS`;
- `MAX_WS_CLIENTS`, `MAX_SSE_CLIENTS`, and `WS_MAX_PAYLOAD_BYTES`;
- proxy request-size, connection, and per-IP limits;
- log rotation, process supervision, and disk monitoring.

The built-in rate limiter is in memory and applies to one Node process. A
multi-process or public deployment needs equivalent edge limits. WebSocket
upgrades enforce the same origin allowlist. Requests with disallowed origins
receive `403`, unsupported methods receive `405`, malformed launch filters are
rejected without terminating the process, and client WebSocket messages are
not accepted.

Keep `TRUST_PROXY_HEADERS=0` unless the only direct caller is a reverse proxy
you control. Otherwise a client can forge forwarded-IP headers and weaken
per-IP limits.

## Health and recovery

Monitor `GET /api/health` independently for each profile. Check:

- expected chain ID and deployment start block;
- indexed block versus latest block;
- WebSocket configured/live status;
- fallback or backfill state;
- RPC request and error counters;
- storage mode and writability;
- the last indexing error.

API WebSocket notifications are not a replay log. Clients load REST on first
render and reload REST after reconnect or tab visibility resume. Keep a tested
state backup until an updated process has caught up and served expected launch
and locker counts.

## Event policy

The reference profiles index D17 lifecycle events only. They exclude
`Swap`, `Sync`, `Transfer`, and `Approval` and do not watch pair contracts by
default. D17's own pool-creation and late-liquidity events remain available.
Broader pair indexing can create very large RPC, storage, and API loads and
should be treated as a separate analytics system.

## Authentication

The API has no account system or embedded browser token. Browser-bundled API
keys are public credentials, not secrets. For private access, authenticate at a
server-side gateway and issue credentials appropriate to each client.
