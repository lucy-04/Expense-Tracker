// Hand-drawn icons in the app's Duolingo-style language: flat two-tone shapes,
// each sitting on a darker "lip" (the same shape shifted down), like the buttons.
// Plain SVG strings so the same source renders in the app (react-native-svg's
// SvgXml) and in scripts/build-icons.mjs, which rasterises the app icon.
// Keep this file free of imports and TypeScript-only syntax: Node loads it directly.

export const ICON_COLORS = {
  blue: '#2F6BFF',
  blueLip: '#1F4FCC',
  blueLight: '#5B8CFF',
  blueSoft: '#E3ECFF',
  blueSoftLip: '#C2D2F2',
  coral: '#FF7A59',
  coralLip: '#D9593A',
  green: '#22C55E',
  greenLip: '#16A34A',
  sun: '#FFC531',
  slate: '#7F96C4',
  slateLip: '#5E77A8',
};

const C = ICON_COLORS;

/** Three rising bars; the app's mark. */
export const dashboardIcon = `
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect x="3.5" y="17" width="7" height="12" rx="3.2" fill="${C.blueLip}"/>
  <rect x="3.5" y="15" width="7" height="12" rx="3.2" fill="${C.blue}"/>
  <rect x="12.5" y="11" width="7" height="18" rx="3.2" fill="${C.blueLip}"/>
  <rect x="12.5" y="9" width="7" height="18" rx="3.2" fill="${C.blueLight}"/>
  <rect x="21.5" y="5" width="7" height="24" rx="3.2" fill="${C.coralLip}"/>
  <rect x="21.5" y="3" width="7" height="24" rx="3.2" fill="${C.coral}"/>
</svg>`;

/** A card of rows, each with a coloured dot. */
export const transactionsIcon = `
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect x="4" y="5" width="24" height="25" rx="6" fill="${C.blueSoftLip}"/>
  <rect x="5" y="3" width="22" height="24" rx="5.5" fill="${C.blueSoft}" stroke="${C.blue}" stroke-width="2"/>
  <circle cx="10.5" cy="9.5" r="2.3" fill="${C.coral}"/>
  <rect x="14.2" y="8.3" width="8.8" height="2.4" rx="1.2" fill="${C.blue}"/>
  <circle cx="10.5" cy="15" r="2.3" fill="${C.green}"/>
  <rect x="14.2" y="13.8" width="8.8" height="2.4" rx="1.2" fill="${C.blue}"/>
  <circle cx="10.5" cy="20.5" r="2.3" fill="${C.sun}"/>
  <rect x="14.2" y="19.3" width="5.8" height="2.4" rx="1.2" fill="${C.blue}"/>
</svg>`;

/** A page with a green "arrow in" badge. */
export const importIcon = `
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <path d="M8.5 5h10l6.5 6.5V27a3 3 0 0 1-3 3H8.5a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" fill="${C.blueSoftLip}"/>
  <path d="M8.5 3h10l6.5 6.5V25a3 3 0 0 1-3 3H8.5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z" fill="#FFFFFF" stroke="${C.blue}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M18.5 3.5v4a2 2 0 0 0 2 2h4" fill="${C.blueSoft}" stroke="${C.blue}" stroke-width="2" stroke-linejoin="round"/>
  <rect x="9.5" y="12.5" width="7.5" height="2.3" rx="1.15" fill="${C.blueLight}"/>
  <rect x="9.5" y="17" width="5" height="2.3" rx="1.15" fill="${C.blueLight}"/>
  <circle cx="22.5" cy="24.8" r="6.3" fill="${C.greenLip}"/>
  <circle cx="22.5" cy="23.3" r="6.3" fill="${C.green}"/>
  <path d="M22.5 20.2v5.6M19.9 23.5l2.6 2.6 2.6-2.6" fill="none" stroke="#FFFFFF" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function gear(cy: number, fill: string) {
  const teeth = Array.from({ length: 8 }, (_, k) => `<rect x="13.4" y="${cy - 13}" width="5.2" height="7" rx="1.8" transform="rotate(${k * 45} 16 ${cy})"/>`).join('');
  return `<g fill="${fill}"><circle cx="16" cy="${cy}" r="9.2"/>${teeth}</g>`;
}

/** A chunky gear with a soft centre. */
export const settingsIcon = `
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  ${gear(17.5, C.slateLip)}
  ${gear(15.5, C.slate)}
  <circle cx="16" cy="15.5" r="4.2" fill="${C.blueSoft}"/>
</svg>`;

/**
 * The app mark at icon scale: the dashboard bars in white and coral, meant to sit
 * on the blue background. `mono` draws a flat single-colour silhouette (Android
 * themed icons tint it themselves).
 */
export function appMark(mono: boolean) {
  const face = (c: string) => (mono ? '#FFFFFF' : c);
  const lip = (c: string) => (mono ? 'none' : c);
  return `
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect x="3.5" y="17" width="7" height="12" rx="3.2" fill="${lip('#BFD0FF')}"/>
  <rect x="3.5" y="15" width="7" height="12" rx="3.2" fill="${face('#FFFFFF')}"/>
  <rect x="12.5" y="11" width="7" height="18" rx="3.2" fill="${lip('#BFD0FF')}"/>
  <rect x="12.5" y="9" width="7" height="18" rx="3.2" fill="${face('#FFFFFF')}"/>
  <rect x="21.5" y="5" width="7" height="24" rx="3.2" fill="${lip(C.coralLip)}"/>
  <rect x="21.5" y="3" width="7" height="24" rx="3.2" fill="${face(C.coral)}"/>
</svg>`;
}
