# Security

Do not report private keys or seed phrases in a public issue. This repository does not need either.

Before exposing the API publicly:

- use HTTPS through a reverse proxy;
- set an explicit `CORS_ALLOWED_ORIGINS` list;
- keep request and connection limits enabled;
- bind to `127.0.0.1` unless a container or reverse proxy requires otherwise;
- keep `MAINNET_HOSTED_DEPLOY_ENABLED=0`; and
- protect the RPC provider credential as a server-side secret.

The WebSocket stream has no replay guarantee. Clients must load a REST snapshot after connecting or reconnecting.
