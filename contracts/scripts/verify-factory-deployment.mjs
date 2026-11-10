#!/usr/bin/env node
import { ethers } from "ethers";
import { artifact, providerFromEnv, readJson, writeJson } from "./lib.mjs";
import { compareRuntimeBytecode, validateFeePolicy } from "./runtime-bytecode.mjs";

const MAINNET_CHAIN_ID = 1;
const MAINNET_WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const MAINNET_UNISWAP_V2_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const ZERO = ethers.ZeroAddress;

const deploymentPath = argValue("--deployment", "runs/factory-deployment.json");
const out = argValue("--out", "runs/factory-verification.json");
const deployment = readJson(deploymentPath);
const provider = providerFromEnv();
const network = await provider.getNetwork();
const chainId = Number(network.chainId);
const policyPath = argValue("--policy", null);
if (chainId === MAINNET_CHAIN_ID && !policyPath) {
  throw new Error("Mainnet verification requires --policy with four independently reviewed fee recipients; deployment metadata alone is insufficient.");
}
const policy = policyPath ? validateFeePolicy(readJson(policyPath), chainId) : null;
const expectedChainId = Number(process.env.D17_EXPECTED_CHAIN_ID || process.env.EXPECTED_CHAIN_ID || deployment.chainId || chainId);

const checks = [];
const runtimeProofs = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
}

function sameAddress(a, b) {
  return ethers.getAddress(a) === ethers.getAddress(b);
}

async function hasCode(label, address) {
  const code = await provider.getCode(address);
  check(`${label} has deployed bytecode`, code && code !== "0x", address);
}

async function verifyRuntime(label, address, values) {
  const art = artifact(`${label}.sol`, label);
  if (!/^solc-[a-zA-Z0-9_-]+$/.test(art.buildInfoId)) throw new Error("Invalid artifact buildInfoId");
  const build = readJson(`artifacts/build-info/${art.buildInfoId}.output.json`);
  const proof = compareRuntimeBytecode(art, build, values, await provider.getCode(address));
  runtimeProofs.push({ address, ...proof });
  check(`${label} exact runtime including immutables`, proof.matches, proof.actualRuntimeKeccak256);
}

if (chainId !== expectedChainId) {
  throw new Error(`RPC chain id ${chainId} does not match expected chain id ${expectedChainId}.`);
}

const factoryArt = artifact("D17Factory.sol", "D17Factory");
const tokenFactoryArt = artifact("D17TokenFactory.sol", "D17TokenFactory");
const vaultFactoryArt = artifact("D17LiquidityVaultFactory.sol", "D17LiquidityVaultFactory");
const launchFactoryArt = artifact("D17LaunchFactory.sol", "D17LaunchFactory");
const launchDeployerArt = artifact("D17LaunchDeployer.sol", "D17LaunchDeployer");
const lockerFactoryArt = artifact("D17LockerFactory.sol", "D17LockerFactory");
const feeConfigArt = artifact("D17FeeConfig.sol", "D17FeeConfig");

const factory = new ethers.Contract(deployment.factory, factoryArt.abi, provider);
const tokenFactory = new ethers.Contract(deployment.tokenFactory, tokenFactoryArt.abi, provider);
const vaultFactory = new ethers.Contract(deployment.liquidityVaultFactory, vaultFactoryArt.abi, provider);
const launchFactory = new ethers.Contract(deployment.launchFactory, launchFactoryArt.abi, provider);
const launchDeployer = new ethers.Contract(deployment.launchDeployer, launchDeployerArt.abi, provider);
const lockerFactory = new ethers.Contract(deployment.lockerFactory, lockerFactoryArt.abi, provider);
const feeConfig = new ethers.Contract(deployment.feeConfig, feeConfigArt.abi, provider);

await hasCode("D17Factory", deployment.factory);
await hasCode("D17TokenFactory", deployment.tokenFactory);
await hasCode("D17LiquidityVaultFactory", deployment.liquidityVaultFactory);
await hasCode("D17LaunchFactory", deployment.launchFactory);
await hasCode("D17LaunchDeployer", deployment.launchDeployer);
await hasCode("D17LockerFactory", deployment.lockerFactory);
await hasCode("D17FeeConfig", deployment.feeConfig);

await verifyRuntime("D17Factory", deployment.factory, { weth: deployment.weth, router: deployment.router, feeConfig: deployment.feeConfig });
await verifyRuntime("D17TokenFactory", deployment.tokenFactory, {});
await verifyRuntime("D17LiquidityVaultFactory", deployment.liquidityVaultFactory, {});
await verifyRuntime("D17LaunchFactory", deployment.launchFactory, { d17Factory: deployment.factory, tokenFactory: deployment.tokenFactory, liquidityVaultFactory: deployment.liquidityVaultFactory, launchDeployer: deployment.launchDeployer });
await verifyRuntime("D17LaunchDeployer", deployment.launchDeployer, {});
await verifyRuntime("D17LockerFactory", deployment.lockerFactory, { d17Factory: deployment.factory });
await verifyRuntime("D17FeeConfig", deployment.feeConfig, {});

check("deployment chain id matches RPC", deployment.chainId === chainId, `${deployment.chainId} vs ${chainId}`);
if (chainId === MAINNET_CHAIN_ID) {
  check("mainnet deployment has startBlock", Number.isInteger(deployment.startBlock) && deployment.startBlock >= 0, String(deployment.startBlock));
} else {
  check("deployment has startBlock", Number.isInteger(deployment.startBlock) && deployment.startBlock >= 0, String(deployment.startBlock));
}

check("D17Factory identity matches", await factory.D17_FACTORY_ID() === ethers.keccak256(ethers.toUtf8Bytes("D17_FACTORY_V15_HARDENED")));
check("D17TokenFactory identity matches", await tokenFactory.D17_TOKEN_FACTORY_ID() === ethers.keccak256(ethers.toUtf8Bytes("D17_TOKEN_FACTORY_V15_HARDENED")));
check(
  "D17LiquidityVaultFactory identity matches",
  await vaultFactory.D17_LIQUIDITY_VAULT_FACTORY_ID() === ethers.keccak256(ethers.toUtf8Bytes("D17_LIQUIDITY_VAULT_FACTORY_V15_HARDENED"))
);

check("D17FeeConfig identity matches", await feeConfig.D17_FEE_CONFIG_ID() === ethers.keccak256(ethers.toUtf8Bytes("D17_FEE_CONFIG_V15_HARDENED")));
check("D17LaunchDeployer identity matches", await launchDeployer.D17_LAUNCH_DEPLOYER_ID() === ethers.keccak256(ethers.toUtf8Bytes("D17_LAUNCH_DEPLOYER_V15_HARDENED")));
check("factory points to fee config", sameAddress(await factory.feeConfig(), deployment.feeConfig));
check("fee config hard cap is 2%", Number(await feeConfig.MAX_PROTOCOL_FEE_BPS()) === 200);
const feeOwnerNow = await feeConfig.owner();
const feePendingOwnerNow = await feeConfig.pendingOwner();
const [feeRecipientNow, feeBpsNow] = await feeConfig.currentFee();
check("fee config rate within cap", Number(feeBpsNow) <= 200, String(feeBpsNow));
if (chainId === MAINNET_CHAIN_ID) {
  // Production publication is deliberately blocked until the multisig renounces. Both fee
  // rate and recipient then become immutable. Review the correct fee splitter first.
  check("mainnet fee config owner renounced", sameAddress(feeOwnerNow, ZERO), feeOwnerNow);
  check("mainnet fee config no pending owner", sameAddress(feePendingOwnerNow, ZERO), feePendingOwnerNow);
  check("mainnet protocol fee exactly 2%", Number(feeBpsNow) === 200, String(feeBpsNow));
  check("mainnet protocol fee recipient equals published splitter", Boolean(deployment.feeSplitter) && sameAddress(feeRecipientNow, deployment.feeSplitter), feeRecipientNow);
} else {
  check("fee config owner matches deployment", sameAddress(feeOwnerNow, deployment.feeConfigOwner));
}
check("factory WETH matches deployment", sameAddress(await factory.weth(), deployment.weth));
check("factory router matches deployment", sameAddress(await factory.router(), deployment.router));
check("factory launch factory pinned", await factory.launchFactoryPinned());
check("factory locker factory pinned", await factory.lockerFactoryPinned());
check("factory launchFactory address", sameAddress(await factory.launchFactory(), deployment.launchFactory));
check("factory lockerFactory address", sameAddress(await factory.lockerFactory(), deployment.lockerFactory));

check("token factory launch factory pinned", await tokenFactory.launchFactoryPinned());
check("token factory launchFactory address", sameAddress(await tokenFactory.launchFactory(), deployment.launchFactory));
check("vault factory launch factory pinned", await vaultFactory.launchFactoryPinned());
check("vault factory launchFactory address", sameAddress(await vaultFactory.launchFactory(), deployment.launchFactory));

check("launch deployer launch factory pinned", await launchDeployer.launchFactoryPinned());
check("launch deployer launchFactory address", sameAddress(await launchDeployer.launchFactory(), deployment.launchFactory));
check("launch factory points to launch deployer", sameAddress(await launchFactory.launchDeployer(), deployment.launchDeployer));
check("launch factory points to D17Factory", sameAddress(await launchFactory.d17Factory(), deployment.factory));
check("launch factory points to token factory", sameAddress(await launchFactory.tokenFactory(), deployment.tokenFactory));
check("launch factory points to liquidity vault factory", sameAddress(await launchFactory.liquidityVaultFactory(), deployment.liquidityVaultFactory));
check("locker factory points to D17Factory", sameAddress(await lockerFactory.d17Factory(), deployment.factory));

if (deployment.feeSplitter) {
  const splitter = new ethers.Contract(deployment.feeSplitter, artifact("D17FeeSplitter.sol", "D17FeeSplitter").abi, provider);
  await hasCode("D17FeeSplitter", deployment.feeSplitter);
  await verifyRuntime("D17FeeSplitter", deployment.feeSplitter, { weth: deployment.weth });
  check("D17FeeSplitter identity matches", await splitter.D17_FEE_SPLITTER_ID() === ethers.keccak256(ethers.toUtf8Bytes("D17_FEE_SPLITTER_V1")));
  check("fee config pays the fee splitter", sameAddress(feeRecipientNow, deployment.feeSplitter), feeRecipientNow);
  check("fee splitter WETH matches deployment", sameAddress(await splitter.weth(), deployment.weth));
  const [splitRecipients, splitBps] = await splitter.recipients();
  check(
    "fee splitter recipients match deployment",
    splitRecipients.length === deployment.feeSplitRecipients.length &&
      splitRecipients.every((address, index) => sameAddress(address, deployment.feeSplitRecipients[index]))
  );
  check("fee splitter shares match deployment", splitBps.map(Number).join() === deployment.feeSplitBps.join(), splitBps.map(Number).join());
  if (chainId === MAINNET_CHAIN_ID) {
    check("mainnet fee split is 50/12.5/12.5/25", splitBps.map(Number).join() === "5000,1250,1250,2500", splitBps.map(Number).join());
  }
  if (policy) {
    check("fee recipients match independent reviewed policy", splitRecipients.length === 4 && splitRecipients.every((address, index) => sameAddress(address, policy.feeSplitRecipients[index])));
    check("fee shares match independent reviewed policy", splitBps.map(Number).join() === policy.feeSplitBps.join());
    check("fee rate matches independent reviewed policy", Number(feeBpsNow) === policy.protocolFeeBps);
  }
}
if (policy) check("reviewed policy requires a splitter", Boolean(deployment.feeSplitter));

if (chainId === MAINNET_CHAIN_ID) {
  check("mainnet WETH is canonical", sameAddress(deployment.weth, MAINNET_WETH));
  check("mainnet Uniswap V2 router is canonical", sameAddress(deployment.router, MAINNET_UNISWAP_V2_ROUTER));
}

// V15 launches cannot be created while any of these owners exists.
check("D17Factory owner renounced", sameAddress(await factory.owner(), ZERO));
check("D17TokenFactory owner renounced", sameAddress(await tokenFactory.owner(), ZERO));
check("D17LiquidityVaultFactory owner renounced", sameAddress(await vaultFactory.owner(), ZERO));
check("D17LaunchDeployer owner renounced", sameAddress(await launchDeployer.owner(), ZERO));

const ok = checks.every((entry) => entry.ok);
const report = {
  schema: "d17-factory-verification-v2",
  createdAt: new Date().toISOString(),
  deployment: deploymentPath,
  chainId,
  factory: deployment.factory,
  protocolFee: { recipient: feeRecipientNow, bps: Number(feeBpsNow) },
  startBlock: deployment.startBlock ?? null,
  ok,
  policyPath,
  runtimeProofs,
  checks
};

writeJson(out, report);
console.log(JSON.stringify(report, null, 2));
provider.destroy?.();

if (!ok) process.exit(1);

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}
