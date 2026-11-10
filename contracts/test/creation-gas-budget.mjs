import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { compile, startNode, waitForRpc, wait, now } from './helpers.mjs';
import { suite, config } from './release-fixture.mjs';
const report = { status: 'running', transactions: [], budget: 16777216, note: 'Local EVM gas only; no estimate of live ETH cost or claim about fork activation.' };
compile(); const child = startNode(9917, 'gasBudget'); let provider;
try {
  provider = await waitForRpc(9917, child); const s = await suite(provider);
  for (const logoBytes of [0, 4096, 8192]) {
    const p = 'data:image/svg+xml;base64,';
    const cfg = config((await now(provider)) + 120, s.treasury, logoBytes ? {
      tokenName: 'N'.repeat(64), tokenSymbol: 'S'.repeat(16), description: 'd'.repeat(512),
      logoSvgUri: p + 'A'.repeat(logoBytes - p.length),
      links: Array.from({length: 8}, (_, i) => ({linkType: String(i).padEnd(32, 'a'), url: 'https://' + 'a'.repeat(120)})),
    } : {});
    if (logoBytes === 8192) {
      await assert.rejects(() => s.factory.createLaunch.staticCall(cfg, {gasLimit: report.budget}));
      report.transactions.push({logoBytes, expectedResult: 'rejected-within-live-budget'});
    } else {
      const receipt = await wait(await s.factory.createLaunch(cfg, {gasLimit: report.budget}));
      assert.ok(receipt.gasUsed < BigInt(report.budget));
      report.transactions.push({logoBytes, gasUsed: String(receipt.gasUsed)});
    }
  }
  report.status = 'passed';
} catch(e) { report.status = 'failed'; report.error = String(e.stack); throw e; }
finally { mkdirSync('runs/security', {recursive: true}); writeFileSync('runs/security/creation-gas-budget.json', JSON.stringify(report,null,2)+'\n'); console.log(JSON.stringify(report)); provider?.destroy(); await child.kill('SIGTERM'); }
