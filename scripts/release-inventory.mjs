import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const MANIFEST = 'release/v15.1/RELEASE_SHA256SUMS.txt';
// Application/release delivery, including tests, public docs and immutable artifacts.
// Audit evidence and coordination are hashed separately by the checkpoint pack.
export const ROOTS = ['.github', 'apps', 'contracts', 'deployments', 'docs', 'operations', 'release', 'scripts'];
export const ROOT_FILES = ['.gitignore', 'package.json', 'package-lock.json', 'README.md', 'LICENSE', 'SECURITY.md', 'CHANGELOG.md', 'VERIFICATION.md', 'SOURCE_INTEGRITY.md', 'd17-installer-hero.png', 'd17-main.png'];
const generated = new Set(['node_modules', '.next', '.vercel']);
const excluded = new Set(['contracts/artifacts', 'contracts/cache', 'contracts/runs', 'apps/api/data']);
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function collect(root) {
  const files = [];
  function visit(relative) {
    assert.ok(!relative.includes('\\') && !/[\r\n]/.test(relative), `UNSAFE_PATH:${relative}`);
    const absolute = path.join(root, relative), stat = lstatSync(absolute);
    assert.ok(!stat.isSymbolicLink(), `SYMLINK_IN_RELEASE:${relative}`);
    const name = path.basename(relative);
    if (stat.isDirectory()) {
      if (generated.has(name) || excluded.has(relative)) return;
      for (const child of readdirSync(absolute).sort()) visit(`${relative}/${child}`);
    } else {
      assert.ok(stat.isFile(), `NOT_REGULAR_FILE:${relative}`);
      if (relative === MANIFEST || name === '.DS_Store' || name.endsWith('.tsbuildinfo')) return;
      assert.ok(!name.startsWith('.env') || /^\.env(?:\.[a-z0-9_-]+)*\.example$/i.test(name), `ENV_IN_RELEASE:${relative}`);
      files.push(relative);
    }
  }
  for (const name of readdirSync(root).filter(n => n.startsWith('.env'))) visit(name);
  for (const relative of [...ROOTS, ...ROOT_FILES]) {
    assert.ok(existsSync(path.join(root, relative)), `MISSING_RELEASE_ROOT:${relative}`);
    visit(relative);
  }
  return files.sort();
}
export function manifestText(root) {
  return collect(root).map(f => `${digest(readFileSync(path.join(root, f)))}  ${f}`).join('\n') + '\n';
}
export function verifyInventory(root) {
  // Compare the canonical text: extra, missing, duplicate, reordered and changed
  // files all fail. Untracked files inside the delivery roots are included too.
  assert.equal(readFileSync(path.join(root, MANIFEST), 'utf8'), manifestText(root), 'V15_1_RELEASE_INVENTORY_MISMATCH');
  return collect(root).length;
}
export function verifyPublicText(root) {
  const patterns = [
    ['absolute user-home path', /\/(?:Users|home)\/[a-z0-9._-]+\//i],
    ['workspace metadata path', new RegExp(`\\.${['co', 'dex'].join('')}(?:/|\\\\)`, 'i')],
    ['email address', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
    ['private key assignment', /\b(?:PRIVATE_KEY|SECRET_KEY|SEED_PHRASE|MNEMONIC)\s*=\s*(?!<|your-|replace-|$)[^\s#]+/i],
    ['private publication marker', new RegExp(`\\b${['PRIVATE','WORK','NOTE'].join(' ')}\\b`, 'i')],
  ];
  for (const f of collect(root)) {
    if (/\.(png|ico|woff2?|jpg|jpeg|gif|pdf)$/i.test(f)) continue;
    const bytes = readFileSync(path.join(root, f));
    // No size cutoff: a secret must not disappear merely because a file is large.
    assert.ok(!bytes.includes(0), `UNEXPECTED_BINARY_IN_PUBLIC_TEXT:${f}`);
    for (const [label, pattern] of patterns) assert.ok(!pattern.test(bytes.toString('utf8')), `PUBLIC_TEXT:${label}:${f}`);
  }
}
