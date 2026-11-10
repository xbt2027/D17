/**
 * Load complete paginated history once, then fetch only until a page overlaps
 * the prior cache. This preserves old lifecycle facts without re-downloading
 * the full launch on every safety reconcile.
 */
export async function loadActivityHistory(fetchPage, cachedItems = []) {
  const cachedIds = new Set(cachedItems.map((item) => item.id));
  const fetched = [];
  const seenCursors = new Set();
  let cursor = "";
  let stale = false;

  for (;;) {
    const page = await fetchPage(cursor);
    stale ||= Boolean(page.stale);
    fetched.push(...page.items);
    const overlapsCache = cachedIds.size > 0 && page.items.some((item) => cachedIds.has(item.id));
    const nextCursor = page.nextCursor || null;
    if (!nextCursor || overlapsCache) break;
    if (seenCursors.has(nextCursor)) throw new Error("Activity pagination cursor repeated");
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  const byId = new Map(cachedItems.map((item) => [item.id, item]));
  for (const item of fetched) byId.set(item.id, item);
  return { items: [...byId.values()], stale };
}
