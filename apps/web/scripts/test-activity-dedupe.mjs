import assert from "node:assert/strict";
import { dedupeActivityActions, dedupeActivityForDisplay } from "../lib/activity-dedupe.mjs";

const base = {
  event: "RoundCommitted",
  hash: "0xaction",
  locker: "0x0000000000000000000000000000000000000001",
  round: 0,
  amountWeth: "1",
};

const launch = (id) => ({ ...base, id, sourceKind: "launch" });
const locker = (id) => ({ ...base, id, sourceKind: "locker" });

assert.deepEqual(
  dedupeActivityForDisplay([locker("mirror"), launch("canonical")]).map((item) => item.id),
  ["canonical"],
  "one launch/locker mirror must become one canonical row",
);

assert.deepEqual(
  dedupeActivityActions([locker("mirror"), launch("canonical")]).map((item) => item.id),
  ["canonical"],
  "accounting must count one mirrored action once",
);

assert.deepEqual(
  dedupeActivityActions([locker("mirror-1"), launch("action-1"), locker("mirror-2"), launch("action-2")]).map((item) => item.id),
  ["action-1", "action-2"],
  "two identical legitimate actions in one transaction must remain two",
);

assert.deepEqual(
  dedupeActivityForDisplay([launch("action-1"), locker("mirror-1"), locker("unpaired-action")]).map((item) => item.id),
  ["action-1", "unpaired-action"],
  "an excess mirror represents an additional real action and must survive",
);

const directRpc = [{ ...base, id: "rpc-1" }, { ...base, id: "rpc-2" }];
assert.equal(dedupeActivityActions(directRpc).length, 2, "direct-RPC events have no mirror source and must pass through");

const poolPair = [
  { id: "vault", event: "LiquidityPoolCreated", hash: "0xpool" },
  { id: "launch", event: "OfficialPoolCreated", hash: "0xpool" },
];
assert.deepEqual(
  dedupeActivityForDisplay(poolPair).map((item) => item.id),
  ["launch"],
  "known lifecycle aliases must prefer the canonical event",
);

const settlements = [
  { id: "settle-1", event: "VaultSettlementClaimed", hash: "0xsettle", locker: base.locker },
  { id: "settle-2", event: "VaultSettlementClaimed", hash: "0xsettle", locker: base.locker },
];
assert.equal(dedupeActivityActions(settlements).length, 2, "non-mirrored accounting events must never be collapsed");

const lateSettlementPair = [
  { id: "late-launch", event: "LateVaultSettlementClaimed", hash: "0xlate", locker: base.locker },
  { id: "late-locker", event: "VaultSettlementCompleted", hash: "0xlate", locker: base.locker },
];
assert.deepEqual(
  dedupeActivityForDisplay(lateSettlementPair).map((item) => item.id),
  ["late-launch"],
  "late settlement launch/locker mirrors must become one row",
);
assert.deepEqual(
  dedupeActivityActions(lateSettlementPair).map((item) => item.id),
  ["late-launch"],
  "late settlement accounting must count the canonical event once",
);

const failedRefundPair = [
  { id: "failed-launch", event: "LaunchFailedRefunded", hash: "0xfailed", locker: base.locker, amountWeth: "1" },
  { id: "failed-locker", event: "FailedLaunchRefunded", hash: "0xfailed", locker: base.locker, amountWeth: "1" },
];
assert.deepEqual(
  dedupeActivityActions(failedRefundPair).map((item) => item.id),
  ["failed-launch"],
  "failed refund launch/locker mirrors must count once",
);

console.log("activity dedupe regression: PASS");
