# Expenses

A personal expense manager for Android that runs **entirely on the phone**. Import the monthly Axis Bank savings statement (password-protected PDF) and see where the money went. No server, no cloud APIs, no AI services.

## Run it

```bash
npm install
npx expo start          # scan the QR code with Expo Go (same Wi-Fi)
```

To import a statement: in Gmail, open the statement email and save the PDF attachment to your phone. Then go to **Import → Choose PDF** and enter the PDF password once. You can let the app remember it in the Android Keystore.

## How it works

| Piece | Where |
|---|---|
| PDF unlock and text extraction: pdf.js in a hidden, offline WebView (works in Expo Go) | `src/pdf/`, `scripts/pdf-extract.js` |
| Axis statement parser. Every import is validated: the running balance must chain and totals must match the statement's Total row, or nothing is imported | `src/core/axisSavingsParser.ts` |
| Description parsing (UPI P2M/P2A, refunds, card, NEFT/IMPS, ATM, interest) | `src/core/narration.ts` |
| Classification. Order: payee rule → self-transfer → refund (linked by UPI ref) → keywords → uncategorized | `src/core/classify.ts`, `src/core/pipeline.ts` |
| Monthly aggregation (refunds netted against the original merchant and category) | `src/core/stats.ts` |
| SQLite storage, payee rules, re-classification | `src/db/` |
| Encrypted backup (scrypt + AES-256-GCM) | `src/core/backupCrypto.ts`, `src/features/backup/` |

Everything in `src/core` is pure TypeScript and unit-tested.

## Scripts

```bash
npm test                  # Jest (core logic)
npm run typecheck
npx expo lint
npm run build:pdf-html    # regenerate src/pdf/extractor-html.ts after upgrading pdfjs-dist

# Regenerate the parser test fixture from a statement (real data: gitignored)
node scripts/dump-pdf-items.mjs "bankStatements/<file>.pdf" src/core/__tests__/fixtures/axis-2026-09.json [password]
```

## Privacy

- `bankStatements/` and `src/core/__tests__/fixtures/` hold real bank data and are gitignored.
- After an import, the app deletes its cached copy of the PDF.
- Expo Go can't encrypt the SQLite file (SQLCipher needs a development build). Data is protected by Android's per-app sandbox plus the fingerprint/PIN lock.

## Roadmap: real-time logging (phase B)

Read Axis transaction SMS (`READ_SMS` plus a broadcast receiver) and log payments as they happen, saved with `source = 'sms'`. When the monthly statement arrives, match them by UPI ref and replace them with the statement rows. This needs a development build (`npx expo run:android` or EAS) because Expo Go can't read SMS.
