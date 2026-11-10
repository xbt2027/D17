import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadDotEnv(path.join(backendRoot, ".env"));

const file = process.env.STATE_FILE
  ? (path.isAbsolute(process.env.STATE_FILE) ? process.env.STATE_FILE : path.resolve(backendRoot, process.env.STATE_FILE))
  : new URL("../data/state.json", import.meta.url);
const state = JSON.parse(readFileSync(file, "utf8"));

console.log(JSON.stringify({
  schema: state.schema,
  chainId: state.chainId,
  latestBlock: state.latestBlock,
  indexedToBlock: state.indexedToBlock,
  launches: Object.keys(state.launches || {}).length,
  lockers: Object.keys(state.lockers || {}).length,
  events: (state.events || []).length,
  metadataVerified: Object.values(state.launches || {}).filter((launch) => launch.metadata?.verified).length,
  eventCounts: (state.events || []).reduce((acc, event) => {
    acc[event.eventName] = (acc[event.eventName] || 0) + 1;
    return acc;
  }, {})
}, null, 2));

function loadDotEnv(file) {
  if (!existsSync(file)) return;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}
