export type DedupeActivityItem = {
  id: string;
  event: string;
  sourceKind?: string;
  hash: string;
  locker?: string;
  round?: number;
  amountWeth?: string;
  amountToken?: string;
  penaltyWeth?: string;
};

export function dedupeActivityForDisplay<T extends DedupeActivityItem>(activity: readonly T[]): T[];
export function dedupeActivityActions<T extends DedupeActivityItem>(activity: readonly T[]): T[];
