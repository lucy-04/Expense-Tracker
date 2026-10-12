// Asks for a PDF password without echoing it, or reads it from the macOS clipboard
// with --password-clipboard. Shared by the dump and mask scripts.
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';

export async function readPassword() {
  if (process.argv.includes('--password-clipboard')) return execSync('pbpaste').toString().trim();
  if (!process.stdin.isTTY) return undefined;
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  process.stdout.write('PDF password (hidden): ');
  rl._writeToOutput = () => {}; // don't echo what's typed
  const pw = await new Promise((resolve) => rl.question('', resolve));
  rl.close();
  process.stdout.write('\n');
  return pw;
}
