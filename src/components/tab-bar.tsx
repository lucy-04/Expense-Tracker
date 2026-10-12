import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { PressableScale } from '@/components/ui';
import { Fonts, Spacing } from '@/constants/theme';
import { dashboardIcon, importIcon, settingsIcon, transactionsIcon } from '@/constants/icons';
import { useTheme } from '@/hooks/use-theme';

const ICONS: Record<string, string> = {
  index: dashboardIcon,
  transactions: transactionsIcon,
  import: importIcon,
  settings: settingsIcon,
};

/**
 * Duolingo-style tab bar: colourful two-tone icons, and the current tab boxed in
 * a soft rounded square. Tabs are peers, so switching never animates; only the
 * press itself gives feedback.
 */
export function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        { backgroundColor: theme.background, borderTopColor: theme.tileBorder, paddingBottom: insets.bottom + Spacing.two },
      ]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const label = descriptors[route.key].options.title ?? route.name;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };
        return (
          <PressableScale
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            // Tabs are pressed constantly: keep the feedback near-imperceptible.
            scaleTo={0.96}
            style={[
              styles.item,
              focused
                ? { backgroundColor: theme.primarySoft, borderColor: theme.primary }
                : { backgroundColor: 'transparent', borderColor: 'transparent' },
            ]}>
            <SvgXml xml={ICONS[route.name] ?? dashboardIcon} width={30} height={30} />
            <ThemedText style={[styles.label, { color: focused ? theme.primary : theme.muted, fontFamily: focused ? Fonts.black : Fonts.bold }]}>
              {label}
            </ThemedText>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderTopWidth: 2,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 56,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 2,
  },
  label: { fontSize: 11, lineHeight: 14 },
});
