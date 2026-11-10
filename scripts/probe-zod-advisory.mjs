// Diagnostic only. Uses small inputs; does not attempt to exhaust memory.
// Usage: node scripts/probe-zod-advisory.mjs /absolute/path/to/extracted/zod/package
// With no argument, probes the currently locked dependency.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateUserConfigZodType } from '@nomicfoundation/hardhat-zod-utils';

const specifier = process.argv[2]
  ? pathToFileURL(path.resolve(process.argv[2], 'index.js')).href : 'zod';
const { z } = await import(specifier);
const N = 4096;
const report = { inputElements: N, cases: [], compatibility: {} };
let checks = 0;
for (const async of [false, true]) {
  for (const constraint of ['none', 'max', 'length', 'set-max']) {
    let visited = 0;
    const item = z.any().superRefine((_value, ctx) => {
      visited++;
      ctx.addIssue({ code: 'custom', message: 'diagnostic invalid item' });
    });
    let schema = constraint === 'set-max' ? z.set(item).max(2) : z.array(item);
    if (constraint === 'max') schema = schema.max(2);
    if (constraint === 'length') schema = schema.length(2);
    const input = constraint === 'set-max'
      ? new Set(Array.from({ length: N }, (_, i) => i)) : Array(N).fill(0);
    const result = async ? await schema.safeParseAsync(input) : schema.safeParse(input);
    assert.equal(result.success, false); checks++;
    assert.ok(result.error.issues.length > 0); checks++;
    report.cases.push({ async, constraint, visited, issues: result.error.issues.length });
  }
}
// Actual installed Hardhat helper expects the Zod 3 error.errors alias.
try {
  const result = validateUserConfigZodType({}, z.object({ required: z.string() }));
  report.compatibility.hardhatValidation = { accepted: true, errors: result.length };
} catch (error) {
  report.compatibility.hardhatValidation = { accepted: false, error: String(error) };
}
try {
  report.compatibility.oneArgumentRecord = z.record(z.string()).safeParse({ key: 'value' }).success;
} catch (error) {
  report.compatibility.oneArgumentRecord = { error: String(error) };
}
report.compatibility.functionHasSafeParse = typeof z.function().safeParse === 'function';
// In-bounds successful inputs must still preserve valid behavior in a candidate.
assert.deepEqual(z.array(z.number()).max(2).parse([1, 2]), [1, 2]); checks++;
assert.deepEqual(z.array(z.number()).length(2).parse([1, 2]), [1, 2]); checks++;
assert.deepEqual([...z.set(z.number()).max(2).parse(new Set([1, 2]))], [1, 2]); checks++;
report.diagnosticAssertions = checks;
report.note = 'Diagnostic completion is not advisory closure. Review visits, issues and compatibility.';
console.log(JSON.stringify(report, null, 2));
