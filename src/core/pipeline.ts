import { classify, type Classification, type ClassifyContext } from './classify';
import { parseNarration } from './narration';
import { txnId } from './txnId';
import type { Narration, RawTxn } from './types';

export type ClassifiedTxn = RawTxn &
  Classification & {
    id: string;
    parsed: Narration;
    /** For refunds: the debit being refunded. */
    linkedTxnId: string | null;
  };

/** A debit already stored from an earlier statement, indexed by UPI ref. */
export type PriorDebit = { id: string; categoryId: string | null };

/**
 * Raw statement rows → ids, parsed narrations, refund links and classification.
 * Debits are classified first so a refund can inherit its debit's category.
 */
export function classifyStatement(
  txns: RawTxn[],
  ctx: ClassifyContext,
  priorDebitsByRef: Map<string, PriorDebit> = new Map(),
): ClassifiedTxn[] {
  const rows = txns.map((t) => ({ ...t, id: txnId(t), parsed: parseNarration(t.narration) }));

  const debitsByRef = new Map(priorDebitsByRef);
  const out = new Map<string, ClassifiedTxn>();

  for (const r of rows) {
    if (r.direction !== 'debit') continue;
    const c = classify({ direction: r.direction, narration: r.narration, parsed: r.parsed }, ctx);
    out.set(r.id, { ...r, ...c, linkedTxnId: null });
    if (r.parsed.ref && !debitsByRef.has(r.parsed.ref)) {
      debitsByRef.set(r.parsed.ref, { id: r.id, categoryId: c.categoryId });
    }
  }
  for (const r of rows) {
    if (r.direction !== 'credit') continue;
    const refundOf = r.parsed.ref ? debitsByRef.get(r.parsed.ref) : undefined;
    const c = classify({ direction: r.direction, narration: r.narration, parsed: r.parsed, refundOf }, ctx);
    out.set(r.id, { ...r, ...c, linkedTxnId: c.type === 'refund' ? (refundOf?.id ?? null) : null });
  }

  return rows.map((r) => out.get(r.id)!);
}
