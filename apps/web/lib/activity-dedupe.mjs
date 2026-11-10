const DISPLAY_EVENT_FAMILY = {
  OfficialPoolCreated: "OfficialPoolCreated",
  LiquidityPoolCreated: "OfficialPoolCreated",
  VaultSettlementClaimed: "VaultSettlementClaimed",
  LateVaultSettlementClaimed: "VaultSettlementClaimed",
  VaultSettlementCompleted: "VaultSettlementClaimed",
  LaunchFailedRefunded: "LaunchFailedRefunded",
  FailedLaunchRefunded: "LaunchFailedRefunded",
};

const CANONICAL_DISPLAY_EVENTS = new Set([
  "OfficialPoolCreated",
  "VaultSettlementClaimed",
  "LateVaultSettlementClaimed",
  "LaunchFailedRefunded",
]);

function mirroredActionKey(item) {
  return [
    item.hash,
    item.event,
    item.locker?.toLowerCase() || "",
    item.round ?? "",
    item.amountWeth ?? "",
    item.amountToken ?? "",
    item.penaltyWeth ?? "",
  ].join(":");
}

function keepPairwise(activity, classify) {
  const keep = new Set();
  const groups = new Map();

  for (const item of activity) {
    const classification = classify(item);
    if (!classification) {
      keep.add(item);
      continue;
    }
    const group = groups.get(classification.key) || { primary: [], mirror: [] };
    group[classification.side].push(item);
    groups.set(classification.key, group);
  }

  for (const group of groups.values()) {
    if (group.primary.length === 0) {
      for (const item of group.mirror) keep.add(item);
      continue;
    }
    for (const item of group.primary) keep.add(item);
    // Pair one mirror with each canonical event. Any excess mirrors represent
    // additional real actions and must remain visible/countable.
    for (const item of group.mirror.slice(group.primary.length)) keep.add(item);
  }

  return activity.filter((item) => keep.has(item));
}

/** Collapse known two-contract views while preserving repeated real actions. */
export function dedupeActivityForDisplay(activity) {
  return keepPairwise(activity, (item) => {
    if (item.event === "RoundCommitted" || item.event === "RoundRefunded") {
      if (item.sourceKind !== "launch" && item.sourceKind !== "locker") return null;
      return {
        key: `mirrored:${mirroredActionKey(item)}`,
        side: item.sourceKind === "launch" ? "primary" : "mirror",
      };
    }

    const family = DISPLAY_EVENT_FAMILY[item.event];
    if (!family) return null;
    return {
      key: ["family", item.hash, family, item.locker?.toLowerCase() || ""].join(":"),
      side: CANONICAL_DISPLAY_EVENTS.has(item.event) ? "primary" : "mirror",
    };
  });
}

const ACCOUNTING_EVENT_FAMILIES = new Set(["VaultSettlementClaimed", "LaunchFailedRefunded"]);

/** Accounting removes known launch/locker mirrors without collapsing repeats. */
export function dedupeActivityActions(activity) {
  return keepPairwise(activity, (item) => {
    if (item.event === "RoundCommitted" || item.event === "RoundRefunded") {
      if (item.sourceKind !== "launch" && item.sourceKind !== "locker") return null;
      return {
        key: `mirrored:${mirroredActionKey(item)}`,
        side: item.sourceKind === "launch" ? "primary" : "mirror",
      };
    }

    const family = DISPLAY_EVENT_FAMILY[item.event];
    if (!family || !ACCOUNTING_EVENT_FAMILIES.has(family)) return null;
    return {
      key: ["family", item.hash, family, item.locker?.toLowerCase() || ""].join(":"),
      side: CANONICAL_DISPLAY_EVENTS.has(item.event) ? "primary" : "mirror",
    };
  });
}
