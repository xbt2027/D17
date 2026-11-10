export type ActivityHistoryPage<T> = {
  items: T[];
  nextCursor?: string | null;
  stale?: boolean;
};

export function loadActivityHistory<T extends { id: string }>(
  fetchPage: (cursor: string) => Promise<ActivityHistoryPage<T>>,
  cachedItems?: T[],
): Promise<{ items: T[]; stale: boolean }>;
