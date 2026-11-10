import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyInventory, verifyPublicText } from './release-inventory.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
// Each previous obligation is explicitly assigned in RELEASE_GATE_MIGRATION.md.
// Fail on any child failure; no catch-and-continue or scanner waivers.
for (const script of ['check-historical-v15.mjs', 'export-candidate.mjs', 'check-candidate-surfaces.mjs', 'check-doc-links.mjs']) {
  const child = spawnSync(process.execPath, [`scripts/${script}`, ...(script === 'export-candidate.mjs' ? ['--check'] : [])], {cwd: root, stdio: 'inherit'});
  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(child.status ?? 1);
}
verifyPublicText(root);
const count = verifyInventory(root);
console.log(`V15.1 release integrity gate PASS: ${count} delivery files. MAINNET NO-GO: scanners, independent audit and live release gates remain separate and mandatory.`);
