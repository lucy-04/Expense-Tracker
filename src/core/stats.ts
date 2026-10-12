import type { Direction, Paise, TxnType } from './types';

/** The fields of a stored transaction that aggregation needs. */
export type StatTxn = {
  id: string;
  date: string;
  direction: Direction;
  amount: Paise;
  type: TxnType;
  categoryId: string | null;
  payeeKey: string;
  counterparty: string;
  /** For refunds: the refunded debit's payee, so refunds net against the right merchant. */
  linkedPayeeKey?: string | null;
};

export type MonthStats = {
  /** Expenses minus refunds. */
  spent: Paise;
  income: Paise;
  invested: Paise;
  transferredIn: Paise;
  transferredOut: Paise;
  byCategory: { categoryId: string | null; amount: Paise; count: number }[];
  byMerchant: { payeeKey: string; name: string; amount: Paise; count: number }[];
  /** Net spend per day of month, index 0 = day 1. */
  daily: Paise[];
};

export function monthStats(txns: StatTxn[], month: string): MonthStats {
  const inMonth = txns.filter((t) => t.date.startsWith(month));
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const daily: Paise[] = Array.from({ length: daysInMonth }, () => 0);

  const cat = new Map<string | null, { amount: Paise; count: number }>();
  const merch = new Map<string, { name: string; amount: Paise; count: number }>();
  let spent = 0;
  let income = 0;
  let invested = 0;
  let transferredIn = 0;
  let transferredOut = 0;

  for (const t of inMonth) {
    const day = Number(t.date.slice(8, 10)) - 1;
    switch (t.type) {
      case 'expense':
      case 'refund': {
        const sign = t.type === 'expense' ? 1 : -1;
        const net = sign * t.amount;
        spent += net;
        daily[day] += net;
        bump(cat, t.categoryId, net, t.type === 'expense');
        const key = t.type === 'refund' ? (t.linkedPayeeKey ?? t.payeeKey) : t.payeeKey;
        const m = merch.get(key) ?? { name: t.counterparty, amount: 0, count: 0 };
        m.amount += net;
        if (t.type === 'expense') {
          m.count += 1;
          m.name = t.counterparty;
        }
        merch.set(key, m);
        break;
      }
      case 'income':
        income += t.amount;
        break;
      case 'investment':
        invested += t.direction === 'debit' ? t.amount : -t.amount;
        break;
      case 'transfer':
        if (t.direction === 'credit') transferredIn += t.amount;
        else transferredOut += t.amount;
        break;
    }
  }

  return {
    spent,
    income,
    invested,
    transferredIn,
    transferredOut,
    byCategory: [...cat.entries()]
      .map(([categoryId, v]) => ({ categoryId, ...v }))
      .filter((c) => c.amount !== 0)
      .sort((a, b) => b.amount - a.amount),
    byMerchant: [...merch.entries()]
      .map(([payeeKey, v]) => ({ payeeKey, ...v }))
      .filter((m) => m.amount !== 0)
      .sort((a, b) => b.amount - a.amount),
    daily,
  };
}

function bump(map: Map<string | null, { amount: Paise; count: number }>, key: string | null, amount: Paise, counts: boolean) {
  const v = map.get(key) ?? { amount: 0, count: 0 };
  v.amount += amount;
  if (counts) v.count += 1;
  map.set(key, v);
}

export type MonthTotal = { month: string; spent: Paise; income: Paise };

/** Spent vs income per month for the trend chart, oldest first, gaps filled with zeros. */
export function monthlyTotals(txns: StatTxn[], lastMonth: string, count: number): MonthTotal[] {
  const months = Array.from({ length: count }, (_, i) => shiftMonth(lastMonth, i - count + 1));
  const by = new Map(months.map((m) => [m, { month: m, spent: 0, income: 0 }]));
  for (const t of txns) {
    const row = by.get(t.date.slice(0, 7));
    if (!row) continue;
    if (t.type === 'expense') row.spent += t.amount;
    else if (t.type === 'refund') row.spent -= t.amount;
    else if (t.type === 'income') row.income += t.amount;
  }
  return months.map((m) => by.get(m)!);
}

/** "2026-01", -1 → "2025-12" */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(month: string, style: 'long' | 'short' = 'long'): string {
  const [y, m] = month.split('-').map(Number);
  const name = new Date(y, m - 1, 1).toLocaleString('en-IN', { month: style === 'long' ? 'long' : 'short' });
  return style === 'long' ? `${name} ${y}` : name;
}
