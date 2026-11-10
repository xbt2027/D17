import assert from "node:assert/strict";
import { loadActivityHistory } from "../lib/activity-history.mjs";

const pages = new Map([
  ["", { items: [{ id: "new-2" }, { id: "new-1" }], nextCursor: "page-2" }],
  ["page-2", { items: [{ id: "old-2" }, { id: "old-1" }], nextCursor: "page-3" }],
  ["page-3", { items: [{ id: "old-0" }], nextCursor: null }],
]);

const initialCalls = [];
const initial = await loadActivityHistory(async (cursor) => {
  initialCalls.push(cursor);
  return pages.get(cursor);
});
assert.deepEqual(initialCalls, ["", "page-2", "page-3"], "initial load must traverse every page");
assert.equal(initial.items.length, 5, "initial load must retain complete history");

const cachedCalls = [];
const cached = await loadActivityHistory(async (cursor) => {
  cachedCalls.push(cursor);
  return pages.get(cursor);
}, [{ id: "old-2", cached: true }, { id: "old-1", cached: true }, { id: "old-0", cached: true }]);
assert.deepEqual(cachedCalls, ["", "page-2"], "reconcile must stop at the first cached overlap");
assert.equal(cached.items.length, 5, "reconcile must merge new rows with all cached history");
assert.equal(cached.items.find((item) => item.id === "old-2")?.cached, undefined, "fresh rows replace cached copies");

await assert.rejects(
  loadActivityHistory(async () => ({ items: [], nextCursor: "same" })),
  /cursor repeated/,
  "a repeated cursor must fail instead of looping forever",
);

console.log("activity history pagination regression: PASS");
