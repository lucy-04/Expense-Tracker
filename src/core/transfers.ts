/** The fields own-transfer matching needs from a stored transaction. */
export type TransferCandidate = {
  id: string;
  accountId: string;
  date: string;
  direction: 'debit' | 'credit';
  amount: number;
  type: string;
  userEdited: boolean;
  linkedTxnId: string | null;
};

/**
 * Money moved between your own accounts appears twice: out of one, into the other.
 * Pairs each row already known to be a self-transfer (it matched your names or UPI IDs)
 * with the opposite row in a *different* account: same amount, opposite direction,
 * at most a day apart. Each row pairs at most once; manually edited rows never change.
 */
export function pairOwnTransfers(rows: TransferCandidate[]): [TransferCandidate, TransferCandidate][] {
  const byAmount = new Map<number, TransferCandidate[]>();
  for (const r of rows) byAmount.set(r.amount, [...(byAmount.get(r.amount) ?? []), r]);
  const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
  const used = new Set<string>();
  const pairs: [TransferCandidate, TransferCandidate][] = [];
  for (const group of byAmount.values()) {
    for (const a of group) {
      if (a.type !== 'transfer' || used.has(a.id)) continue;
      const b = group.find(
        (x) =>
          !used.has(x.id) &&
          x.accountId !== a.accountId &&
          x.direction !== a.direction &&
          !x.userEdited &&
          days(x.date, a.date) <= 1 &&
          // Already paired with each other: nothing to do.
          !(x.linkedTxnId === a.id && a.linkedTxnId === x.id),
      );
      if (!b) continue;
      used.add(a.id);
      used.add(b.id);
      pairs.push([a, b]);
    }
  }
  return pairs;
}
