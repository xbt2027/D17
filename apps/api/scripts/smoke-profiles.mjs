import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "d17-api-profiles-"));
const profiles = [
  { name: "sepolia", chainId: 11155111, port: 18788, deployment: "sepolia.json" },
  { name: "mainnet", chainId: 1, port: 18789, deployment: "mainnet.json" },
];

for (const profile of profiles) {
  const stateFile = path.join(tempRoot, `state-${profile.name}.json`);
  const logoDir = path.join(tempRoot, `logos-${profile.name}`);
  await writeFile(stateFile, `${JSON.stringify(emptyState(profile.chainId), null, 2)}\n`);
  await writeFile(path.join(tempRoot, `.env.${profile.name}`), [
    "INDEX_DISABLED=1",
    "RPC_URL=http://127.0.0.1:9",
    `PORT=${profile.port}`,
    `STATE_FILE=${stateFile}`,
    `LOGO_DIR=${logoDir}`,
    `FACTORY_DEPLOYMENT_FILE=./deployments/${profile.deployment}`,
    "HOST=127.0.0.1",
    "CORS_ALLOWED_ORIGINS=http://allowed.example",
    "MAINNET_HOSTED_DEPLOY_ENABLED=0",
  ].join("\n") + "\n");
}

const child = spawn(process.execPath, ["scripts/run-all.mjs"], {
  cwd: apiRoot,
  env: { ...process.env, D17_PROFILE_CONFIG_DIR: tempRoot },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (chunk) => { output += chunk.toString(); });
child.stderr.on("data", (chunk) => { output += chunk.toString(); });

try {
  for (const profile of profiles) {
    const base = `http://127.0.0.1:${profile.port}`;
    const health = await waitForJson(`${base}/api/health`);
    assert(health.meta?.chainId === profile.chainId, `${profile.name} REST chain`);
    assert(health.data?.storage?.writable === true, `${profile.name} writable state`);

    const schema = await waitForJson(`${base}/api/deployer/schema`);
    assert(schema.meta?.chainId === profile.chainId, `${profile.name} schema chain`);
    assert(schema.data?.profile === profile.name, `${profile.name} schema profile`);
    assert(schema.data?.createLaunch.signature.includes("uint16[5]"), `${profile.name} ABI-derived creation signature`);
    assert(!schema.data?.createLaunch.signature.endsWith("bool))"), `${profile.name} no stale bool field`);
    assert(schema.data?.lateSettlement.mode === (profile.name === "mainnet" ? "complete-settlement-before-pool" : "late-lp-topup"), `${profile.name} versioned settlement policy`);
    if (profile.name === "mainnet") {
      assert(schema.data?.mainnetHostedDeployEnabled === false, "mainnet deploy remains fail-closed");
    }

    const snapshot = await wsSnapshot(`ws://127.0.0.1:${profile.port}/api/ws`);
    assert(snapshot.meta?.chainId === profile.chainId, `${profile.name} WebSocket chain`);
  }
  console.log("D17 dual-profile API smoke: PASS");
} finally {
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
  }
  await rm(tempRoot, { recursive: true, force: true });
}

function emptyState(chainId) {
  const now = new Date().toISOString();
  return {
    schema: "d17-reference-api-state-v1",
    createdAt: now,
    updatedAt: now,
    chainId,
    startBlock: 1,
    latestBlock: 1,
    indexedToBlock: 1,
    blocks: {},
    addressKinds: {},
    launches: {},
    lockers: {},
    launchLockers: {},
    metadataEvents: {},
    events: [],
  };
}

async function waitForJson(url) {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Profile server did not become ready: ${lastError?.message || output}`);
}

function wsSnapshot(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { origin: "http://allowed.example" });
    const timer = setTimeout(() => reject(new Error(`WebSocket snapshot timed out: ${url}`)), 2_000);
    socket.once("message", (data) => {
      clearTimeout(timer);
      socket.close();
      resolve(JSON.parse(data.toString()));
    });
    socket.once("error", reject);
  });
}

function assert(condition, label) {
  if (!condition) throw new Error(`Dual-profile smoke assertion failed: ${label}`);
}
