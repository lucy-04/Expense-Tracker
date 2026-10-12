// Produces a privacy-safe copy of a bank statement's LAYOUT, for learning new
// formats without exposing real data. Every letter run becomes X/x and every
// digit 9, except a fixed list of generic statement words (column headers,
// transaction codes, month and bank names), so structure survives:
//   "05-09-2026  UPI/P2M/1291…/Myntra /Paymen/YES BANK"  →  "99-99-9999  UPI/P2M/9999…/Xxxxxx /Xxxxxx/YES BANK"
//
//   node scripts/mask-statement.mjs <file.pdf|.csv> [outDir]
//     --password-clipboard   read the PDF password from the macOS clipboard (never printed)
//     (or, run in your own terminal, it asks for the password with hidden input)
//
// Writes <outDir>/<name>.masked.json (text items with positions) and
// <name>.masked.txt (lines in reading order). Default outDir: ./masked
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, extname, join } from 'node:path';

import { readPassword } from './read-password.mjs';

const require = createRequire(import.meta.url);

const KEEP = new Set(
  `
  date txn tran trans transaction value posting post book details detail description narration particulars remarks remark
  withdrawal withdrawals withdrawn debit debits dr deposit deposits credit credits cr balance bal amount amt closing opening
  total totals chq cheque check no ref reference number num instrument mode type branch code ifsc micr account acct ac
  statement period from to of page summary brought forward carried opening available ledger currency inr rs
  upi neft imps rtgs ach nach ecs pos atm cwdr cash card debitcard creditcard ecom ecommerce purchase online pur int pd
  interest charges charge fee gst tds sweep si mob ib inb net banking transfer trf by p2m p2a ref online_ref rev reversal refund
  jan feb mar apr may jun jul aug sep sept oct nov dec january february march april june july august september october november december
  axis hdfc sbi icici kotak yes idfc indusind federal pnb bob baroda canara union bandhan au rbl paytm airtel fino bank ltd limited state india
  `
    .split(/\s+/)
    .filter(Boolean),
);

export function maskText(s) {
  // Whole alphanumeric tokens, so codes like "P2M" survive when they're on the keep-list.
  return s.replace(/[A-Za-z0-9]+/g, (tok) => {
    if (/[A-Za-z]/.test(tok) && KEEP.has(tok.toLowerCase())) return tok;
    return tok.replace(/[A-Z]/g, 'X').replace(/[a-z]/g, 'x').replace(/\d/g, '9');
  });
}

async function maskPdf(path) {
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  const { extractPdfItems } = require('./pdf-extract.js');
  const data = () => new Uint8Array(readFileSync(path));
  let result = await extractPdfItems(pdfjs, data(), undefined);
  if (!result.ok && result.password) result = await extractPdfItems(pdfjs, data(), await readPassword());
  if (!result.ok) throw new Error(result.password ? `PDF password ${result.password}` : result.error);
  const pages = result.pages.map((p) => ({ ...p, items: p.items.map((it) => ({ ...it, str: maskText(it.str) })) }));
  return { pages, text: linesOf(pages) };
}

function maskCsv(path) {
  const text = readFileSync(path, 'utf8');
  return { text: text.split(/\r?\n/).map(maskText).join('\n') };
}

/** Reading-order lines (same grouping idea as src/core/pdfLines.ts) for a human-readable view. */
function linesOf(pages) {
  const out = [];
  for (const { page, items } of pages) {
    out.push(`──── page ${page} ────`);
    const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
    let line = [];
    let y = NaN;
    const flush = () => {
      if (!line.length) return;
      line.sort((a, b) => a.x - b.x);
      out.push(line.map((i) => `[x${Math.round(i.x)}] ${i.str.replace(/\u0000/g, ' ').trim()}`).join('  '));
      line = [];
    };
    for (const it of sorted) {
      if (line.length && Math.abs(it.y - y) > 2) flush();
      if (!line.length) y = it.y;
      line.push(it);
    }
    flush();
  }
  return out.join('\n');
}

const [file, outDir = 'masked'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!file) {
  console.error('usage: node scripts/mask-statement.mjs <file.pdf|.csv> [outDir] [--password-clipboard]');
  process.exit(1);
}
const ext = extname(file).toLowerCase();
const masked = ext === '.pdf' ? await maskPdf(file) : ext === '.csv' || ext === '.txt' ? maskCsv(file) : null;
if (!masked) {
  console.error(`Unsupported type ${ext}. For Excel files, export or save as CSV for now.`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const base = join(outDir, basename(file, ext).trim().replace(/\s+/g, '-'));
if (masked.pages) writeFileSync(`${base}.masked.json`, JSON.stringify({ pages: masked.pages }, null, 1));
writeFileSync(`${base}.masked.txt`, masked.text);
console.log(`wrote ${base}.masked.${masked.pages ? 'json + .txt' : 'txt'}`);
