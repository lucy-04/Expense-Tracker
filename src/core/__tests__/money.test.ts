import { formatPaise, parseAmount } from '../money';

describe('money', () => {
  it.each([
    ['42.50', 4250],
    ['2,345.67', 234567],
    ['1,00,000.00', 10000000],
    ['100000.50', 10000050],
    ['-12.30', -1230],
  ])('parses %s', (s, p) => expect(parseAmount(s)).toBe(p));

  it.each(['06.09.2026', '123456', 'YBS', '1.5'])('rejects %s', (s) => expect(parseAmount(s)).toBeNull());

  it('formats with Indian grouping', () => {
    expect(formatPaise(4250)).toBe('₹42.50');
    expect(formatPaise(234567)).toBe('₹2,345.67');
    expect(formatPaise(1234567890)).toBe('₹1,23,45,678.90');
    expect(formatPaise(-50000, { decimals: false })).toBe('-₹500');
  });
});
