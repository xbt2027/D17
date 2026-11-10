import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const PROFILE_DEFAULTS = {
  sepolia: { chainId: 11155111, port: 8787, deployment: "sepolia.json", state: "state-sepolia.json" },
  mainnet: { chainId: 1, port: 8788, deployment: "mainnet.json", state: "state-mainnet.json" },
};

export function loadProfileConfig(apiRoot, profile, inherited = process.env) {
  const defaults = PROFILE_DEFAULTS[profile];
  if (!defaults) throw new Error(`Unknown API profile: ${profile}`);

  const configRoot = inherited.D17_PROFILE_CONFIG_DIR
    ? path.resolve(inherited.D17_PROFILE_CONFIG_DIR)
    : apiRoot;
  const dotenvFile = path.join(configRoot, `.env.${profile}`);
  const profileEnv = existsSync(dotenvFile) ? parseDotEnv(readFileSync(dotenvFile, "utf8")) : {};
  const env = { ...inherited, ...profileEnv };
  env.LOAD_DOTENV = "0";
  env.CHAIN_ID = String(defaults.chainId);
  env.PORT ||= String(defaults.port);
  env.FACTORY_DEPLOYMENT_FILE ||= `./deployments/${defaults.deployment}`;
  env.STATE_FILE ||= `./data/${defaults.state}`;
  env.LOGO_DIR ||= `./data/logos-${profile}`;

  if (!env.RPC_URL || /your-.+-rpc\.example/i.test(env.RPC_URL)) {
    throw new Error(`Create apps/api/.env.${profile} from .env.${profile}.example and set a real RPC_URL.`);
  }

  const deploymentPath = path.resolve(apiRoot, env.FACTORY_DEPLOYMENT_FILE);
  const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));
  if (Number(deployment.chainId) !== defaults.chainId) {
    throw new Error(`${profile} deployment manifest has chain ${deployment.chainId}; expected ${defaults.chainId}.`);
  }

  const statePath = path.resolve(apiRoot, env.STATE_FILE);
  if (existsSync(statePath)) {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    if (Number(state.chainId) !== defaults.chainId) {
      throw new Error(`${profile} state has chain ${state.chainId}; expected ${defaults.chainId}.`);
    }
  }

  return {
    profile,
    env,
    port: Number(env.PORT),
    statePath,
    logoPath: path.resolve(apiRoot, env.LOGO_DIR),
  };
}

function parseDotEnv(source) {
  const result = {};
  for (const line of source.split(/\r?\n/)) {
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value;
  }
  return result;
}
