// Rasterises the app icon, Android adaptive-icon layers and splash image from the
// SVG mark in src/constants/icons.ts, using headless Chrome.
//
//   node scripts/build-icons.mjs            → writes assets/images/*
//   node scripts/build-icons.mjs --preview  → also writes a preview sheet to $PREVIEW_OUT
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { appMark, dashboardIcon, ICON_COLORS, importIcon, settingsIcon, transactionsIcon } from '../src/constants/icons.ts';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = new URL('../assets/images/', import.meta.url).pathname;
const work = mkdtempSync(join(tmpdir(), 'icons-'));

function render(name, html, size, outPath) {
  const file = join(work, `${name}.html`);
  writeFileSync(
    file,
    `<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${html}</body></html>`,
  );
  execFileSync(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--default-background-color=00000000',
    `--window-size=${size[0]},${size[1]}`,
    `--screenshot=${outPath}`,
    `file://${file}`,
  ], { stdio: 'ignore' });
  console.log('wrote', outPath);
}

/** Places an SVG string, sized `px`, centred on a `canvas`-sized square. */
const centred = (svg, px, canvas, bg = 'transparent') =>
  `<div style="width:${canvas}px;height:${canvas}px;background:${bg};display:flex;align-items:center;justify-content:center">
     <div style="width:${px}px;height:${px}px">${svg.replace('<svg ', `<svg width="${px}" height="${px}" `)}</div>
   </div>`;

// Full legacy icon: mark on the blue square (Android masks the shape itself).
render('icon', centred(appMark(false), 600, 1024, ICON_COLORS.blue), [1024, 1024], join(OUT, 'icon.png'));
// Adaptive icon foreground: the mark inside the 66% safe zone, transparent around it.
render('fg', centred(appMark(false), 470, 1024), [1024, 1024], join(OUT, 'android-icon-foreground.png'));
// Themed-icon (monochrome) layer: flat white silhouette the system tints.
render('mono', centred(appMark(true), 470, 1024), [1024, 1024], join(OUT, 'android-icon-monochrome.png'));
// Splash image: the mark alone, drawn on the blue splash background by the plugin.
render('splash', centred(appMark(false), 860, 1024), [1024, 1024], join(OUT, 'splash-icon.png'));

if (process.argv.includes('--preview')) {
  const tab = (svg, bg) => `<div style="background:${bg};padding:14px;border-radius:16px">${svg.replace('<svg ', '<svg width="44" height="44" ')}</div>`;
  const row = (bg) =>
    `<div style="display:flex;gap:18px;padding:18px;background:${bg}">${[dashboardIcon, transactionsIcon, importIcon, settingsIcon]
      .map((s) => tab(s, bg))
      .join('')}</div>`;
  const masked = `<div style="width:180px;height:180px;border-radius:50%;overflow:hidden;background:${ICON_COLORS.blue};display:flex;align-items:center;justify-content:center">${appMark(false).replace('<svg ', '<svg width="100" height="100" ')}</div>`;
  render(
    'preview',
    `<div style="font-family:sans-serif">${row('#FFFFFF')}${row('#11151F')}<div style="display:flex;gap:24px;padding:18px;background:#EEE">${masked}${centred(appMark(true), 100, 180, '#555')}</div></div>`,
    [420, 460],
    process.env.PREVIEW_OUT ?? join(work, 'preview.png'),
  );
}
