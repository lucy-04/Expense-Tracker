import { parseNarration } from '../narration';

// All names, references and notes below are fictional.
describe('parseNarration', () => {
  it('parses UPI merchant payments', () => {
    expect(parseNarration('UPI/P2M/100000000002/Swiggy Ltd /Pay fo/AXIS BANK')).toEqual({
      channel: 'UPI',
      upiKind: 'P2M',
      ref: '100000000002',
      counterparty: 'Swiggy Ltd',
      payeeKey: 'SWIGGYLTD',
      note: 'Pay fo',
      bank: 'AXIS BANK',
    });
  });

  it('drops the "UPI" filler note', () => {
    const n = parseNarration('UPI/P2M/100000000001/SHARMA GENERAL STORE /UPI/YES BANK LIMITED YBS');
    expect(n.note).toBeUndefined();
    expect(n.counterparty).toBe('SHARMA GENERAL STORE');
  });

  it('parses person-to-person with a bank code', () => {
    expect(parseNarration('UPI/P2A/100000000004/ROHAN M/BARB/savings/')).toMatchObject({
      upiKind: 'P2A',
      counterparty: 'ROHAN M',
      bank: 'BARB',
      note: 'savings',
    });
  });

  it('parses person-to-person with a bank name', () => {
    expect(parseNarration('UPI/P2A/100000000005/ARJUN NAIR /UPI/HDFC BANK LTD')).toMatchObject({
      upiKind: 'P2A',
      counterparty: 'ARJUN NAIR',
      bank: 'HDFC BANK LTD',
    });
  });

  it('parses UPI refunds', () => {
    expect(parseNarration('UPI/ONLINE_REF/100000000009/06.09.2026')).toMatchObject({
      upiKind: 'REFUND',
      ref: '100000000009',
    });
  });

  it('parses debit card e-commerce purchases', () => {
    expect(parseNarration('E-COMMERCE PURCHASE AT NETFLIX* SUB-LOS GATOS')).toMatchObject({
      channel: 'CARD',
      counterparty: 'NETFLIX SUB',
    });
  });

  it('recognises ATM withdrawals and interest', () => {
    expect(parseNarration('CWDR/123456/AXIS ATM DELHI').channel).toBe('ATM');
    expect(parseNarration('900000000000001:Int.Pd:01-07-2026 to 30-09-2026').channel).toBe('INTEREST');
  });
});
