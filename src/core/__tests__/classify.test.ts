import { isSelf, keywordCategory, type ClassifyContext } from '../classify';
import { classifyStatement } from '../pipeline';
import type { RawTxn } from '../types';

// All names, references and amounts below are fictional.
const ctx = (over: Partial<ClassifyContext> = {}): ClassifyContext => ({
  myNames: ['Rohan Mehta'],
  payeeRules: new Map(),
  ...over,
});

const debit = (narration: string, amount: number, balance = 100000): RawTxn => ({
  date: '2026-09-05',
  narration,
  amount,
  direction: 'debit',
  balance,
});
const credit = (narration: string, amount: number, balance = 100000): RawTxn => ({ ...debit(narration, amount, balance), direction: 'credit' });

describe('keywordCategory', () => {
  it.each([
    ['Swiggy Ltd', 'food-delivery'],
    ['Zomato Media Private', 'food-delivery'],
    ['Myntra', 'shopping'],
    ['MYNTRA DESIGNS PRIVAT', 'shopping'],
    ['NETFLIX SUB', 'subscriptions'],
    ['SHARMA GENERAL STORE', 'groceries'],
    ['NEW CITY STORES', 'groceries'],
    ['ROSE BAKE HOUSE', 'food-snacks'],
    ['CORNER QUICK BITES', 'food-snacks'],
    ['TASTY FOODS CITY', 'food-snacks'],
    ['Kavita R', null],
  ])('%s → %s', (name, expected) => {
    expect(keywordCategory(name)).toBe(expected);
  });
});

describe('isSelf', () => {
  it('matches the truncated form banks print', () => {
    expect(isSelf('ROHAN M', ['Rohan Mehta'])).toBe(true);
    expect(isSelf('ROHAN MEHTA', ['Rohan Mehta'])).toBe(true);
  });
  it('does not match other people', () => {
    expect(isSelf('ROHAN KAPOOR', ['Rohan Mehta'])).toBe(false);
    expect(isSelf('RIYA SEN', ['Rohan Mehta'])).toBe(false);
    expect(isSelf('ROH', ['Rohan Mehta'])).toBe(false);
  });
});

describe('classifyStatement', () => {
  it('links a refund to its debit by UPI ref and inherits the category', () => {
    const rows = classifyStatement(
      [
        debit('UPI/P2M/100000000009/Myntra /Paymen/YES BANK LIMITED YBS', 150000, 400000),
        credit('UPI/P2M/100000000009/Myntra/YESB//', 30000, 430000),
        credit('UPI/ONLINE_REF/100000000009/06.09.2026', 20000, 450000),
      ],
      ctx(),
    );
    expect(rows[0]).toMatchObject({ type: 'expense', categoryId: 'shopping' });
    expect(rows[1]).toMatchObject({ type: 'refund', categoryId: 'shopping', linkedTxnId: rows[0].id });
    expect(rows[2]).toMatchObject({ type: 'refund', categoryId: 'shopping', linkedTxnId: rows[0].id });
  });

  it('links refunds to debits from an earlier statement', () => {
    const prior = new Map([['555', { id: 'old-debit', categoryId: 'shopping' }]]);
    const [row] = classifyStatement([credit('UPI/ONLINE_REF/555/01.10.2026', 1000)], ctx(), prior);
    expect(row).toMatchObject({ type: 'refund', linkedTxnId: 'old-debit', categoryId: 'shopping' });
  });

  it('treats money from your own other account as a transfer', () => {
    const [row] = classifyStatement([credit('UPI/P2A/100000000004/ROHAN M/BARB/savings/', 200000)], ctx());
    expect(row).toMatchObject({ type: 'transfer', categoryId: null, reason: 'self-transfer' });
  });

  it('leaves unknown people uncategorized until tagged', () => {
    const [row] = classifyStatement([debit('UPI/P2M/100000000010/Kavita R /UPI/YES BANK LIMITED YBS', 5000)], ctx());
    expect(row).toMatchObject({ type: 'expense', categoryId: null, reason: 'default' });
  });

  it('applies a remembered payee rule', () => {
    const rules = new Map([['KAVITAR', { payeeKey: 'KAVITAR', categoryId: 'food-snacks' }]]);
    const [row] = classifyStatement(
      [debit('UPI/P2M/100000000010/Kavita R /UPI/YES BANK LIMITED YBS', 5000)],
      ctx({ payeeRules: rules }),
    );
    expect(row).toMatchObject({ type: 'expense', categoryId: 'food-snacks', reason: 'payee-rule' });
  });

  it('lets a payee rule override the type (e.g. a friend you settle up with → transfer)', () => {
    const rules = new Map([['ARJUNNAIR', { payeeKey: 'ARJUNNAIR', type: 'transfer' as const }]]);
    const [row] = classifyStatement([debit('UPI/P2A/100000000005/ARJUN NAIR /UPI/HDFC BANK LTD', 50000)], ctx({ payeeRules: rules }));
    expect(row).toMatchObject({ type: 'transfer', categoryId: null });
  });

  it('classifies person-to-person credits as income and interest as income', () => {
    const rows = classifyStatement(
      [credit('UPI/P2A/100000000006/RIYA SEN/PUNB/thanks/', 75000), credit('900000000000001:Int.Pd:01-07-2026 to 30-09-2026', 1234)],
      ctx(),
    );
    expect(rows.map((r) => r.type)).toEqual(['income', 'income']);
  });

  it('gives identical rows with different balances different ids', () => {
    const rows = classifyStatement(
      [debit('UPI/P2M/1/CORNER QUICK BITES /UPI/YES', 6000, 20000), debit('UPI/P2M/1/CORNER QUICK BITES /UPI/YES', 6000, 14000)],
      ctx(),
    );
    expect(rows[0].id).not.toBe(rows[1].id);
  });
});
