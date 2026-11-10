# Production web preparation — 30 October 2026

NO-GO; no Vercel publication or account changes performed. Existing Sepolia project/deployment preserved. These names come from apps/web/lib/d17Network.ts, d17Api.ts, .env.example and optional API profiles. Do not place secret values in coordination files. NEXT_PUBLIC values are visible in browser bundles; use only browser-scoped RPC credentials with provider origin/rate limits.

| Concern | Mainnet preparation | Sepolia rehearsal |
|---|---|---|
| Chain | 1 |11155111 |
| Versioned ABI | /abi/v15.1 | separate candidate V15.1 deployment; old existing V15 stays /abi |
| Default network | NEXT_PUBLIC_D17_DEFAULT_NETWORK=mainnet | sepolia |
| Read mode | NEXT_PUBLIC_D17_DATA_MODE=rpc | rpc |
| HTTP RPC name | NEXT_PUBLIC_D17_MAINNET_RPC_URL | NEXT_PUBLIC_D17_SEPOLIA_RPC_URL |
| Optional WS RPC name | NEXT_PUBLIC_D17_MAINNET_RPC_WS_URL | NEXT_PUBLIC_D17_SEPOLIA_RPC_WS_URL |
| Explorer name | NEXT_PUBLIC_D17_MAINNET_EXPLORER_BASE | NEXT_PUBLIC_D17_SEPOLIA_EXPLORER_BASE |
| Interface | NEXT_PUBLIC_SITE_MODE=full | full |
| Pre-GO deploy UI | NEXT_PUBLIC_ENABLE_DEPLOY=false | enable only for approved candidate rehearsal |
| Test/local controls | NEXT_PUBLIC_ENABLE_TEST_CONTROLS=false; NEXT_PUBLIC_D17_ENABLE_LOCAL=false | no local keys on public deployment |
| Optional USD | NEXT_PUBLIC_ENABLE_USD=false | false unless independently configured |

Canonical D17 deployment addresses do NOT come from a text env override: deployments/mainnet.json and its three mirrored copies pin Factory/FeeConfig/TokenFactory/LaunchDeployer/VaultFactory/LaunchFactory/LockerFactory, WETH/router, chain and startBlock. FeeSplitter address and four recipients also require release provenance/policy proof. All current mainnet D17 addresses are zero and status not-deployed. Expected real addresses cannot be supplied without deployer addresses/nonces. Publish only after runtime/receipts/fee/owner checks, with status deployed and protocolVersion V15_1. No silent default to historical ABI.

For the separate production Vercel project, connect the user-approved GOSPEL repository/branch containing the pinned candidate. Framework Next.js, root apps/web; permit workspace files outside project root. Install locked workspace dependencies from repository root (npm ci), build apps/web (npm run build there; root command npm run build delegates). Local/CI baseline Node24.22.1/npm12.2.1. For hosting, select and verify the intended major version, check package engines overrides and record the actual build version; Vercel controls patch updates; output .next framework default. Verify actual Vercel monorepo configuration/build log before domain routing; no repository/account credentials in this file. Importing a project does not authorize publishing contributions. Keep production and preview environment scopes separate.

Use the intended HTTPS production origin and explicitly approved preview origins in dRPC browser allowlists; verify HTTP and WS access, chain, eth_getLogs history/range, throttling and failure display. CORS/provider allowlists are operational controls, not concealment of a NEXT_PUBLIC key. Avoid wildcard origin for quota-bearing endpoints. Cloudflare DNS/TLS/domain ownership is user/manager operations; route only after deployment proofs and wallet smoke.

Optional indexed API mode needs NEXT_PUBLIC_D17_*_API_BASE and *_WS_URL, plus persistent backend state (not transient Vercel serverless local files). Backend-only names: CHAIN_ID, RPC_URL, WS_URL, FACTORY_DEPLOYMENT_FILE, D17_PROTOCOL_VERSION, STATE_FILE, LOGO_DIR, CORS_ALLOWED_ORIGINS, CONFIRMATIONS, LOG_CHUNK_SIZE, HOST, PORT. ABI version must agree with manifest; conflicting explicit version fails startup. Separate state files for each chain. CORS_ALLOWED_ORIGINS lists exact approved HTTPS web origins; MAINNET_HOSTED_DEPLOY_ENABLED remains0. Test read/WS disconnect and HTTP recovery.

Release smoke: wrong chain/account changes prevent signature; not-deployed prevents writes; D-002 blocks pool until complete settlement; no post-open settle action for V15.1; ABI and schema source match; failed creation simulation/estimate never asks for signature; gas limit respects EIP-7825; explorer links/Factory startBlock correct. Local production-build Chromium proof now covers 40 checks and 11 EDR wallet-shim transactions (AUDITOR_PACK/RENDERED_WALLET_2026-11-08.md). Real extension/Safe/mobile wallet and published-origin/RPC proof remain pending. A 390px browser viewport is not a real mobile wallet test.

Official hosting references checked for this preparation: https://vercel.com/docs/monorepos ; https://vercel.com/docs/project-configuration/general-settings ; https://vercel.com/docs/functions/runtimes/node-js/node-js-versions . Settings described here are a proposed configuration for this repository, not proof of an existing connected Vercel project.
