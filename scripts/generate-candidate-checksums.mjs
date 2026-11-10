import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { MANIFEST, manifestText, verifyPublicText, collect } from './release-inventory.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
verifyPublicText(root);
writeFileSync(path.join(root, MANIFEST), manifestText(root));
console.log(`Generated V15.1 application/release inventory: ${collect(root).length} files. Audit/coordination evidence has separate checkpoint hashes. NO-GO.`);
