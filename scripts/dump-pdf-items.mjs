// Dumps the pdf.js text items of a statement PDF to JSON — the same shape the
// in-app WebView returns (both use scripts/pdf-extract.js). Used as a test
// fixture for src/core. Output contains real bank data: keep it gitignored.
//
//   node scripts/dump-pdf-items.mjs <in.pdf> <out.json> [--password-clipboard]
// For a password-protected PDF it asks for the password with hidden input.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
const { extractPdfItems } = require('./pdf-extract.js');
const { readPassword } = await import('./read-password.mjs');

const [inPath, outPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!inPath || !outPath) {
  console.error('usage: node scripts/dump-pdf-items.mjs <in.pdf> <out.json> [--password-clipboard]');
  process.exit(1);
}

const data = () => new Uint8Array(readFileSync(inPath));
let result = await extractPdfItems(pdfjs, data(), undefined);
if (!result.ok && result.password) result = await extractPdfItems(pdfjs, data(), await readPassword());
if (!result.ok) {
  console.error(result.password ? `password ${result.password}` : result.error);
  process.exit(1);
}
writeFileSync(outPath, JSON.stringify({ pages: result.pages }, null, 1));
console.log(`wrote ${result.pages.length} pages to ${outPath}`);
