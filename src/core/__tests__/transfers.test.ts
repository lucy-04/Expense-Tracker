import { pairOwnTransfers, type TransferCandidate } from '../transfers';

const row = (over: Partial<TransferCandidate>): TransferCandidate => ({
  id: Math.random().toString(36).slice(2),
  accountId: 'axis',
  date: '2026-09-14',
  direction: 'credit',
  amount: 160000,
  type: 'income',
  userEdited: false,
  linkedTxnId: null,
  ...over,
});

describe('pairOwnTransfers', () => {
  it('pairs a known self-transfer with the opposite row in another account', () => {
    const axisIn = row({ id: 'axis-in', type: 'transfer' });
    const bobOut = row({ id: 'bob-out', accountId: 'bob', direction: 'debit', type: 'expense', date: '2026-09-13' });
    expect(pairOwnTransfers([axisIn, bobOut]).map(([a, b]) => [a.id, b.id])).toEqual([['axis-in', 'bob-out']]);
  });

  it('ignores the same account, the same direction, a different amount or more than a day apart', () => {
    const t = row({ id: 't', type: 'transfer' });
    expect(pairOwnTransfers([t, row({ direction: 'debit' })])).toEqual([]); // same account
    expect(pairOwnTransfers([t, row({ accountId: 'bob' })])).toEqual([]); // same direction
    expect(pairOwnTransfers([t, row({ accountId: 'bob', direction: 'debit', amount: 150000 })])).toEqual([]);
    expect(pairOwnTransfers([t, row({ accountId: 'bob', direction: 'debit', date: '2026-09-16' })])).toEqual([]);
  });

  it('needs one side to be known as yours: two strangers paying the same amount are not paired', () => {
    expect(pairOwnTransfers([row({}), row({ accountId: 'bob', direction: 'debit' })])).toEqual([]);
  });

  it('never touches manual edits, pairs each row once, and skips pairs already linked', () => {
    const t = row({ id: 't', type: 'transfer' });
    expect(pairOwnTransfers([t, row({ accountId: 'bob', direction: 'debit', userEdited: true })])).toEqual([]);
    const two = pairOwnTransfers([t, row({ id: 'x', accountId: 'bob', direction: 'debit' }), row({ id: 'y', accountId: 'bob', direction: 'debit' })]);
    expect(two).toHaveLength(1);
    const a = row({ id: 'a', type: 'transfer', linkedTxnId: 'b' });
    const b = row({ id: 'b', accountId: 'bob', direction: 'debit', type: 'transfer', linkedTxnId: 'a' });
    expect(pairOwnTransfers([a, b])).toEqual([]);
  });
});
