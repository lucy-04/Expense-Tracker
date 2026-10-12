import type { Narration } from './types';

/** Uppercase words, alphanumerics + single spaces. "Swiggy Ltd " → "SWIGGY LTD". For keyword and name matching. */
export function normalizeWords(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/**
 * A payee's identity: uppercase alphanumerics with no spaces at all ("SWIGGYLTD").
 * Spaces are dropped because statement formats wrap names differently: the same
 * person can print as "AVNI KAPO" in one export and "AVNIKAPO" in another.
 */
export function payeeKey(name: string): string {
  return normalizeWords(name).replace(/ /g, '');
}

/** A UPI ID inside a description: name@handle. */
const VPA_RE = /[A-Za-z0-9][A-Za-z0-9._-]*@[A-Za-z][A-Za-z0-9]*/;

function make(n: Omit<Narration, 'payeeKey'>): Narration {
  const counterparty = n.counterparty.replace(/\s+/g, ' ').trim() || 'Unknown';
  return { ...n, counterparty, payeeKey: payeeKey(counterparty) };
}

/**
 * Splits a bank statement narration into its parts. Known shapes:
 *   UPI/P2M/<ref>/<name>/<note>/<bank>          Axis: payment to a merchant QR
 *   UPI/P2A/<ref>/<name>/<bankcode>/<note>/     payment to/from a person
 *   UPI/P2A/<ref>/<name>/UPI/<bank>             (variant)
 *   UPI/ONLINE_REF/<ref>/<dd.mm.yyyy>           refund / cashback
 *   E-COMMERCE PURCHASE AT <merchant>-<city>    debit card online
 *   NEFT/<ref>/<name>/..., IMPS/P2A/<ref>/<name>/..., CWDR/..., <acct>:Int.Pd:...
 *   UPI/<ref>/<hh:mm:ss>/UPI/<upi id>/<note>    Bank of Baroda: no name, only the UPI ID
 * Anything else falls back to the UPI ID if one is present, else the most name-like part.
 */
export function parseNarration(raw: string): Narration {
  const text = raw.replace(/\s+/g, ' ').trim();
  const parts = text.split('/').map((p) => p.trim());
  const head = parts[0].toUpperCase();

  if (head === 'UPI') {
    const kind = (parts[1] ?? '').toUpperCase();
    // Bank of Baroda style: the second field is the reference itself.
    if (/^\d{6,}$/.test(kind)) {
      const vpaIdx = parts.findIndex((p, i) => i > 1 && VPA_RE.test(p));
      const vpa = vpaIdx >= 0 ? VPA_RE.exec(parts[vpaIdx])![0].toLowerCase() : undefined;
      const after = vpaIdx >= 0 ? parts.slice(vpaIdx + 1).find((p) => p && !/^UPI$/i.test(p)) : undefined;
      return make({ channel: 'UPI', ref: parts[1], counterparty: vpa ?? bestName(parts.slice(2)) ?? 'UPI', note: after });
    }
    const ref = parts[2] || undefined;
    if (kind === 'ONLINE_REF') {
      return make({ channel: 'UPI', upiKind: 'REFUND', ref, counterparty: 'UPI refund' });
    }
    const name = parts[3] ?? '';
    if (kind === 'P2M') {
      return make({ channel: 'UPI', upiKind: 'P2M', ref, counterparty: name, note: noteOf(parts[4]), bank: parts[5] || undefined });
    }
    if (kind === 'P2A') {
      // Either /<bankcode>/<note>/ (4-letter IFSC prefix) or /UPI/<bank name>.
      const isBankCode = /^[A-Z]{4}$/.test(parts[4] ?? '');
      return make({
        channel: 'UPI',
        upiKind: 'P2A',
        ref,
        counterparty: name,
        bank: isBankCode ? parts[4] : parts[5] || undefined,
        note: isBankCode ? noteOf(parts[5]) : undefined,
      });
    }
    return make({ channel: 'UPI', ref, counterparty: name || parts[1] || 'UPI' });
  }

  const card = /^(?:E-COMMERCE PURCHASE AT|POS PURCHASE AT|PUR\/)\s*(.+)$/i.exec(text);
  if (card) {
    // "ANTHROPIC* CL-SAN FRANCISCO" → "ANTHROPIC* CL"
    const merchant = card[1].includes('-') ? card[1].slice(0, card[1].lastIndexOf('-')) : card[1];
    return make({ channel: 'CARD', counterparty: merchant.replace(/\*/g, ' ') });
  }

  if (head === 'NEFT' || head === 'RTGS') {
    return make({ channel: head, ref: parts[1] || undefined, counterparty: parts[2] ?? head, bank: parts[3] || undefined });
  }
  if (head === 'IMPS') {
    const hasKind = /^P2[AM]$/i.test(parts[1] ?? '');
    const off = hasKind ? 1 : 0;
    return make({ channel: 'IMPS', ref: parts[1 + off] || undefined, counterparty: parts[2 + off] ?? 'IMPS', bank: parts[3 + off] || undefined });
  }
  if (/^(CWDR|ATM-CASH|ATM CASH|NFS\/CASH|ATW)/i.test(text)) {
    return make({ channel: 'ATM', counterparty: 'Cash withdrawal' });
  }
  if (/Int\.?\s*Pd/i.test(text)) {
    return make({ channel: 'INTEREST', counterparty: 'Interest' });
  }
  const vpa = VPA_RE.exec(text)?.[0];
  if (vpa) {
    return make({ channel: /UPI/i.test(text) ? 'UPI' : 'OTHER', ref: /\b\d{12}\b/.exec(text)?.[0], counterparty: vpa.toLowerCase() });
  }
  return make({ channel: 'OTHER', counterparty: bestName(parts) ?? text });
}

/** Axis pads unused note slots with "UPI" and truncates ("Pay fo", "Sent usi"). */
function noteOf(s: string | undefined): string | undefined {
  if (!s || /^UPI$/i.test(s)) return undefined;
  return s;
}

function bestName(parts: string[]): string | undefined {
  return parts.find((p) => /[A-Za-z]{3,}/.test(p) && !/^\d+$/.test(p) && p.length > 2);
}
