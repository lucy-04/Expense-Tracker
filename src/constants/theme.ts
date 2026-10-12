
/**
 * "Ocean" palette, built in Duolingo's design language: flat bold faces, each
 * sitting on a darker "lip" that gives buttons and tiles their 3D push.
 * Every *Lip colour is the pressed-into edge of its face colour.
 */
export const Colors = {
  light: {
    background: '#FFFFFF',
    text: '#1A2233',
    textSecondary: '#6B7590',
    muted: '#98A1B8',

    // Tiles (Duolingo-style cards: 2px border, thicker bottom lip)
    tile: '#FFFFFF',
    tileBorder: '#E1E7F5',
    tileLip: '#CDD6EC',
    tilePressed: '#F5F8FF',
    badge: '#EEF3FF',
    track: '#E8EDF8',

    primary: '#2F6BFF',
    primaryLip: '#1F4FCC',
    primarySoft: '#E3ECFF',
    onPrimary: '#FFFFFF',

    coral: '#FF7A59',
    coralLip: '#D9593A',

    success: '#22C55E',
    successLip: '#16A34A',
    successSoft: '#DCFCE7',
    successText: '#15803D',

    danger: '#E5484D',
    dangerLip: '#C2363B',
    dangerSoft: '#FDE2E3',

    // The colour band behind the dashboard header and the status bar
    band: '#2F6BFF',
    onBand: '#FFFFFF',
    onBandMuted: 'rgba(255,255,255,0.78)',
    bandChip: 'rgba(255,255,255,0.18)',

    // Charts: validated with the dataviz palette checker on these surfaces
    series1: '#2F6BFF',
    series2: '#E8603E',
    grid: '#E8EDF8',

    // Legacy names still used by a few components
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E3ECFF',
    accent: '#2F6BFF',
    onAccent: '#FFFFFF',
    positive: '#15803D',
    critical: '#E5484D',
  },
  dark: {
    background: '#11151F',
    text: '#F1F4FA',
    textSecondary: '#9AA4BD',
    muted: '#6E7894',

    tile: '#1C2231',
    tileBorder: '#2B3347',
    tileLip: '#2B3347',
    tilePressed: '#222A3C',
    badge: '#252D40',
    track: '#2B3347',

    primary: '#5B8CFF',
    primaryLip: '#3B66D6',
    primarySoft: '#1F2B4A',
    onPrimary: '#FFFFFF',

    coral: '#FF7A59',
    coralLip: '#C9512F',

    success: '#22C55E',
    successLip: '#15803D',
    successSoft: '#163A26',
    successText: '#4ADE80',

    danger: '#F0646A',
    dangerLip: '#B8383D',
    dangerSoft: '#3A1D22',

    band: '#1D3B8F',
    onBand: '#FFFFFF',
    onBandMuted: 'rgba(255,255,255,0.72)',
    bandChip: 'rgba(255,255,255,0.14)',

    series1: '#5B8CFF',
    series2: '#E8603E',
    grid: '#2B3347',

    backgroundElement: '#1C2231',
    backgroundSelected: '#1F2B4A',
    accent: '#5B8CFF',
    onAccent: '#FFFFFF',
    positive: '#4ADE80',
    critical: '#F0646A',
  },
} as const;

/** Sequential blue ramp, light→dark, for magnitude (the daily spending calendar). */
export const SequentialBlue = ['#D6E3FF', '#AFC8FF', '#83A9FF', '#5B8CFF', '#2F6BFF', '#1F4FCC'] as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Nunito: rounded and heavy, the friendly voice of the app. Loaded in the root layout. */
export const Fonts = {
  regular: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extraBold: 'Nunito_800ExtraBold',
  black: 'Nunito_900Black',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  tile: 16,
  button: 16,
  pill: 999,
  badge: 14,
} as const;

/** Height of the darker edge under buttons and tiles; the face drops this far when pressed. */
export const LipHeight = 4;

// The JS tab bar sits below the screens (not over them), so content needs no extra bottom inset.
export const BottomTabInset = 0;
export const MaxContentWidth = 800;
