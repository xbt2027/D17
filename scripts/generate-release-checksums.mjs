import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectReleaseFiles, RELEASE_MANIFEST_NAME } from "./release-files.mjs";

// Generate the manifest LAST: every build/tooling step that rewrites a
// release file (e.g. next build regenerating next-env.d.ts) must run before
// this script, and check-release verifies exactly that.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = collectReleaseFiles(root);
const lines = files.map((relative) => {
  const digest = createHash("sha256").update(readFileSync(path.join(root, relative))).digest("hex");
  return `${digest}  ${relative}`;
});

writeFileSync(path.join(root, RELEASE_MANIFEST_NAME), `${lines.join("\n")}\n`);
console.log(`Generated ${RELEASE_MANIFEST_NAME} for ${lines.length} release files`);
