import { spawnSync } from 'node:child_process';
// npm can exit 0 while reporting extraneous optional packages. Preserve both the
// raw structured report and exit code; any reported tree problem fails this gate.
const r = spawnSync('npm', ['ls', '--all', '--json'], {encoding: 'utf8'});
if (r.error) throw r.error;
if (r.stderr) process.stderr.write(r.stderr);
let report;
try { report = JSON.parse(r.stdout); }
catch { process.stderr.write('DEPENDENCY_TREE_INVALID_JSON\n'); process.exit(1); }
const problems = new Set();
function visit(node, location = 'root') {
  for (const problem of node.problems || []) problems.add(problem);
  if (node.invalid) problems.add(`invalid:${location}`);
  if (node.extraneous) problems.add(`extraneous:${location}`);
  for (const [name, child] of Object.entries(node.dependencies || {})) visit(child, `${location}/${name}`);
}
visit(report);
process.stdout.write(JSON.stringify({npmExitCode: r.status, problems: [...problems], report}, null, 2) + '\n');
if (r.status !== 0 || problems.size) process.exit(1);
console.log('Dependency tree strict gate PASS. This is not a vulnerability audit.');
