import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadProfileConfig } from "./profile-config.mjs";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = path.join(apiRoot, "src/server.mjs");
const profiles = [
  loadProfileConfig(apiRoot, "sepolia"),
  loadProfileConfig(apiRoot, "mainnet"),
];

for (const field of ["port", "statePath", "logoPath"]) {
  if (profiles[0][field] === profiles[1][field]) {
    throw new Error(`Sepolia and mainnet API profiles must use different ${field}.`);
  }
}

const children = profiles.map(({ env }) =>
  spawn(process.execPath, [server], { cwd: apiRoot, env, stdio: "inherit" })
);

let stopping = false;
function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill(signal);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stop(signal));
}

for (const child of children) {
  child.on("exit", (code) => {
    if (!stopping) {
      stop();
      process.exitCode = code && code !== 0 ? code : 1;
    }
  });
}
