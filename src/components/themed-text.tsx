import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'small' | 'smallBold' | 'heading' | 'subtitle' | 'title' | 'display' | 'code';
  themeColor?: ThemeColor;
  /** Fixed-width digits so amounts line up and don't jitter when they change. */
  tabular?: boolean;
};

export function ThemedText({ style, type = 'default', themeColor, tabular, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  return <Text style={[{ color: theme[themeColor ?? 'text'] }, styles[type], tabular && styles.tabular, style]} {...rest} />;
}

// Android picks a weight by font family, not fontWeight, so each step names its family.
// Large type gets tighter leading and negative tracking; small type stays open.
export const textStyles = StyleSheet.create({
  default: { fontFamily: Fonts.regular, fontSize: 16, lineHeight: 22 },
  small: { fontFamily: Fonts.regular, fontSize: 14, lineHeight: 19 },
  smallBold: { fontFamily: Fonts.extraBold, fontSize: 14, lineHeight: 19 },
  heading: { fontFamily: Fonts.extraBold, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  subtitle: { fontFamily: Fonts.black, fontSize: 28, lineHeight: 33, letterSpacing: -0.5 },
  title: { fontFamily: Fonts.black, fontSize: 34, lineHeight: 39, letterSpacing: -0.8 },
  display: { fontFamily: Fonts.black, fontSize: 52, lineHeight: 58, letterSpacing: -1.5 },
  code: { fontFamily: 'monospace', fontSize: 12, lineHeight: 17 },
});

const styles = { ...textStyles, tabular: { fontVariant: ['tabular-nums' as const] } };
