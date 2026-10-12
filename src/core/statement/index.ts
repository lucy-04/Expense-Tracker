import type { PdfPage, StatementParse } from '../types';
import { readCsvTable } from './csvTable';
import { readPdfTable } from './pdfTable';
import { resolveStatement } from './resolve';

/** Any bank's PDF statement (pdf.js text items) → validated transactions. */
export function parseStatementPdf(pages: PdfPage[]): StatementParse {
  return resolveStatement(readPdfTable(pages));
}

/** Any bank's CSV export → validated transactions. */
export function parseStatementCsv(text: string): StatementParse {
  return resolveStatement(readCsvTable(text));
}
