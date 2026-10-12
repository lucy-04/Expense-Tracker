import { INVESTMENT_RE, KEYWORD_RULES } from './categories';
import { normalizeWords } from './narration';
import type { Direction, Narration, TxnType } from './types';

/** A user decision remembered per payee ("Kavita R" → Food & Snacks). */
export type PayeeRule = { payeeKey: string; categoryId?: string | null; type?: TxnType };

export type ClassifyContext = {
  /** Your own name as banks print it, e.g. "ROHAN M", "Rohan Mehta". */
  myNames: string[];
  payeeRules: Map<string, PayeeRule>;
};

export type ClassifyInput = {
  direction: Direction;
  narration: string;
  parsed: Narration;
  /** The earlier debit this credit refunds, if refundLinker found one. */
  refundOf?: { id: string; categoryId: string | null };
};

export type Classification = {
  type: TxnType;
  categoryId: string | null;
  reason: 'payee-rule' | 'self-transfer' | 'refund' | 'keyword' | 'investment' | 'interest' | 'default';
};

/** Order: explicit payee type → self-transfer → refund → payee category → keywords → default. */
export function classify(input: ClassifyInput, ctx: ClassifyContext): Classification {
  const { direction, parsed } = input;
  const rule = ctx.payeeRules.get(parsed.payeeKey);

  if (rule?.type) {
    return { type: rule.type, categoryId: rule.type === 'expense' ? (rule.categoryId ?? null) : null, reason: 'payee-rule' };
  }
  if (isSelf(parsed.counterparty, ctx.myNames)) {
    return { type: 'transfer', categoryId: null, reason: 'self-transfer' };
  }
  if (direction === 'credit' && (input.refundOf || parsed.upiKind === 'REFUND')) {
    return { type: 'refund', categoryId: input.refundOf?.categoryId ?? null, reason: 'refund' };
  }
  if (INVESTMENT_RE.test(input.narration)) {
    return { type: 'investment', categoryId: null, reason: 'investment' };
  }
  if (direction === 'credit') {
    if (parsed.channel === 'INTEREST') return { type: 'income', categoryId: null, reason: 'interest' };
    return { type: 'income', categoryId: null, reason: rule ? 'payee-rule' : 'default' };
  }
  if (rule && rule.categoryId !== undefined) {
    return { type: 'expense', categoryId: rule.categoryId, reason: 'payee-rule' };
  }
  if (parsed.channel === 'ATM') return { type: 'expense', categoryId: 'cash', reason: 'keyword' };
  const kw = keywordCategory(parsed.counterparty);
  if (kw) return { type: 'expense', categoryId: kw, reason: 'keyword' };
  return { type: 'expense', categoryId: null, reason: 'default' };
}

export function keywordCategory(counterparty: string): string | null {
  const words = normalizeWords(counterparty);
  return KEYWORD_RULES.find((r) => r.re.test(words))?.categoryId ?? null;
}

/**
 * Banks truncate names ("ROHAN M" for "Rohan Mehta"), so a counterparty matches
 * when its words line up with one of your names and only the last word may be cut
 * short. Needs ≥5 chars so a stray "RAM" doesn't match "RAMESH".
 */
export function isSelf(counterparty: string, myNames: string[]): boolean {
  // A UPI ID (BOB prints those instead of names) must match one of yours exactly.
  if (counterparty.includes('@')) {
    const id = counterparty.trim().toLowerCase();
    return myNames.some((n) => n.trim().toLowerCase() === id);
  }
  const cp = normalizeWords(counterparty);
  if (cp.length < 5) return false;
  const cpWords = cp.split(' ');
  return myNames.some((n) => {
    const nameWords = normalizeWords(n).split(' ');
    if (cpWords.length > nameWords.length) return false;
    return cpWords.every((w, i) => (i === cpWords.length - 1 ? nameWords[i].startsWith(w) : nameWords[i] === w));
  });
}
