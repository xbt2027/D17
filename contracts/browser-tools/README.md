# Rendered wallet regression

Run from the repository root on Linux x64, with Node/npm matching the root package:

```sh
npm ci --ignore-scripts
npm ci --prefix contracts/browser-tools --ignore-scripts
npm run test:browser
```

The separate lockfile pins Playwright 1.62.1 and the npm-distributed
Sparticuz Chromium 153.0.0 binary. These tools are not dependencies of the
web application or the deployed contracts. Chromium's shared system libraries
must be installed; CI uses `npx playwright install-deps chromium` from this
directory. If necessary, install those libraries before running the test.

The test extracts the packed executable directly to ignored `contracts/runs/`.
This avoids both a second browser download and the vendor extraction helper's
unsupported ownership changes in the test environment. It uses standard
Playwright arguments plus `--no-sandbox` and `--disable-dev-shm-usage` in an
isolated, local-only test. It does not disable web security. This third-party
headless Chromium is version 153.0.8010.0, not Playwright's bundled Chrome 151.
The reported browser version and executable SHA256 identify the tested runtime.
Browser compatibility beyond this observed run is not assumed.

The default run builds and starts the **production** Next application with a
fixture-only local configuration. This replaces the local `.next` build;
rebuild with your intended configuration before using that directory elsewhere.
It deploys frozen canonical D17 contracts plus fixture WETH/router on ephemeral
EDR, exposes local JSON-RPC on 127.0.0.1:9751, and renders the app on
127.0.0.1:3051. The browser blocks nonlocal requests. All wallet transactions
use EDR's disposable accounts; no keys, public RPC, mainnet/testnet transactions,
or real wallet extension are involved. Do not run against an external chain.

The EIP-1193 shim supports account changes, a rejected network switch, and a
rejected unwrap signature. Assertions use the rendered UI and actual EVM
balances/receipts: contributions, new owner Locker creation, voluntary refund,
failed-R1 full principal/penalty-only recovery, separate ETH conversion, gas,
no retained failed-launch fee, phone-width layout and disabled mainnet writes.
The partial-conversion regression waits for the refreshed UI, not merely a toast.

Results and server/build logs are written to `contracts/runs/rendered-wallet/`.
Failures exit nonzero and include the visible page text in the JSON report.
The tracked `next-env.d.ts` is restored after the run. A development-only debug
run can use `D17_BROWSER_WEB_MODE=development`; its evidence is not a production
build result. Optional explicit runtime overrides are `D17_PLAYWRIGHT_MODULE`
and `D17_CHROMIUM_EXECUTABLE`; record their versions/hashes with any evidence.

Still required separately: actual extension/Safe/mobile wallet testing,
published HTTPS origin and real provider checks, new-candidate Sepolia
rehearsal, independent audit and explicit mainnet release authorization.
