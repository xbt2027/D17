import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadProfileConfig } from "./profile-config.mjs";

const profile = process.argv[2];
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = loadProfileConfig(apiRoot, profile);
Object.assign(process.env, config.env);

await import("../src/server.mjs");
