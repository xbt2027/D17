import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { SimpleView, type SimpleModel } from '../app/simple-view';
import { poolFundingReady } from '../lib/protocol-version.mjs';

const noop = () => {};
const base: SimpleModel = {
  chainName: 'Local', isMainnet: false, hasLaunch: true, loaded: true, phase: 'pool-ready',
  roundIndex: 0, startsAt: 0, endsAt: 1, nowSeconds: 2, rounds: [], launch: null,
  rulesMismatch: false, rules: null, raisedEth: 1, participants: 2, minimumEth: 1,
  minimumReached: true, roundOneRaisedEth: 1, roundOneTokens: 1, roundMarket: [], priceEthPerToken: null,
  wallet: { connected: true, hasVault: true, findingVault: false },
  mine: { totalEth: 0, totalTokens: 0, rows: [], collected: false, tokensToSend: 0, ethToRecover: 0, ethWaiting: 0 },
  takeBack: { eth: 0, feePct: 1 }, amount: '', setAmount: noop, estimateTokens: null,
  pending: '', pendingSeconds: 0, canCommit: false, canTakeBack: false, canClose: false,
  canCollect: false, canOpenTrading: false, fundingReady: false, fullSettlementRequired: true,
  failedRefundKnown: true, canSend: false, canRecover: false, tokenAddress: '', creatorVesting: null,
  otherLaunches: [], launchesLoaded: true, createLaunchHref: '/deploy',
  actions: { connect: noop, createVault: noop, commit: noop, takeBack: noop, close: noop,
    collect: noop, openTrading: noop, send: noop, recover: noop, sendEth: noop,
    releaseCreator: noop, addToken: noop, selectLaunch: noop, allLaunches: noop, expertView: noop },
};
let checks = 0;
const check = (label: string, condition: boolean) => { assert.ok(condition, label); checks++; };
const html = (changes: Partial<SimpleModel>) => renderToStaticMarkup(<SimpleView m={{...base, ...changes}} />);
for (const unknown of [false, undefined, null, 'true', 1]) {
  check('one settled user never authorizes V15.1 opening without exact true', !poolFundingReady('V15_1', unknown, true));
}
check('exact all-settled read permits candidate opening', poolFundingReady('V15_1', true, false));
check('historical V15 still permits one settled user', poolFundingReady('V15_HARDENED', false, true));
check('historical V15 also waits for funding', !poolFundingReady('V15_HARDENED', true, false));
assert.throws(() => poolFundingReady('unknown', true, true)); checks++;
const pending = html({});
check('candidate explains complete settlement', pending.includes('Every remaining contribution must settle'));
check('candidate explains caller-funded liveness', pending.includes('There is no automatic keeper'));
check('candidate never shows one-buyer readiness', !pending.includes('as soon as one buyer'));
check('candidate offers no premature open button', !pending.includes('>Open trading<'));
const ready = html({fundingReady: true, canOpenTrading: true});
check('funded candidate shows open action', ready.includes('>Open trading<'));
const old = html({fullSettlementRequired: false});
check('historical behavior remains described', old.includes('as soon as one buyer'));
const penaltyOnly = html({phase: 'failed', canRecover: true, mine: {...base.mine, ethToRecover: 0.01}});
check('zero-live-position penalty is displayed', penaltyOnly.includes('0.01 WETH'));
check('penalty-only owner can unlock claim', penaltyOnly.includes('Unlock my refund'));
check('refund explains earlier penalty and separate withdrawal', penaltyOnly.includes('earlier R1 penalty') && penaltyOnly.includes('Then send it'));
const unknown = html({phase: 'failed', failedRefundKnown: false});
check('unknown balance is not reported as refunded', unknown.includes('refund balance is unavailable') && !unknown.includes('back in your wallet'));
check('unknown balance has no claim button', !unknown.includes('Unlock my refund'));
const window = html({phase: 'settle', endsAt: 100});
check('countdown never guarantees a trading-open time', window.includes('claim window ends') && !window.includes('Trading opens in'));
console.log(`Launch-state rendering: ${checks} checks PASS (candidate/historical/unknown/penalty-only).`);
