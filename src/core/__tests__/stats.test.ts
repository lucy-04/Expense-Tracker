import { monthStats, monthlyTotals, shiftMonth, type StatTxn } from '../stats';

const t = (over: Partial<StatTxn>): StatTxn => ({
  id: Math.random().toString(36),
  date: '2026-09-05',
  direction: 'debit',
  amount: 1000,
  type: 'expense',
  categoryId: 'shopping',
  payeeKey: 'MYNTRA',
  counterparty: 'Myntra',
  ...over,
});

describe('monthStats', () => {
  const txns: StatTxn[] = [
    t({ amount: 150000 }),
    t({ date: '2026-09-09', direction: 'credit', type: 'refund', amount: 30000, payeeKey: 'UPI REFUND', counterparty: 'UPI refund', linkedPayeeKey: 'MYNTRA' }),
    t({ date: '2026-09-01', amount: 5500, categoryId: 'food-snacks', payeeKey: 'CORNER QUICK BITES', counterparty: 'CORNER QUICK BITES' }),
    t({ date: '2026-09-14', direction: 'credit', type: 'transfer', amount: 200000, categoryId: null }),
    t({ date: '2026-09-16', direction: 'credit', type: 'income', amount: 5500, categoryId: null }),
    t({ date: '2026-10-01', amount: 99999 }),
  ];
  const s = monthStats(txns, '2026-09');

  it('nets refunds out of spending and ignores transfers', () => {
    expect(s.spent).toBe(150000 - 30000 + 5500);
    expect(s.income).toBe(5500);
    expect(s.transferredIn).toBe(200000);
  });

  it('nets refunds against the original merchant and category', () => {
    expect(s.byMerchant[0]).toEqual({ payeeKey: 'MYNTRA', name: 'Myntra', amount: 120000, count: 1 });
    expect(s.byCategory.map((c) => c.categoryId)).toEqual(['shopping', 'food-snacks']);
  });

  it('builds a daily series sized to the month', () => {
    expect(s.daily).toHaveLength(30);
    expect(s.daily[0]).toBe(5500);
    expect(s.daily[8]).toBe(-30000);
  });
});

describe('monthlyTotals', () => {
  it('fills gaps and keeps order', () => {
    const rows = monthlyTotals([t({ date: '2026-08-02', amount: 100 }), t({ date: '2026-08-03', direction: 'credit', type: 'income', amount: 50 })], '2026-09', 3);
    expect(rows).toEqual([
      { month: '2026-07', spent: 0, income: 0 },
      { month: '2026-08', spent: 100, income: 50 },
      { month: '2026-09', spent: 0, income: 0 },
    ]);
  });

  it('shifts months across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2025-12', 1)).toBe('2026-01');
  });
});
