import { useEffect } from 'react';
import { StyleSheet, TextInput, type StyleProp, type TextStyle } from 'react-native';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/** "₹1,23,456" from paise, Indian digit grouping, no decimals. Runs on the UI thread. */
function rupees(paise: number): string {
  'worklet';
  const negative = paise < 0;
  const digits = String(Math.round(Math.abs(paise) / 100));
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}₹${rest ? `${rest},${last3}` : last3}`;
}

/**
 * A rupee amount that counts to its new value when it changes (e.g. switching months),
 * so the change reads as a change rather than a swap. Drawn every frame on the UI
 * thread through a read-only TextInput; React never re-renders while it runs.
 */
export function AnimatedRupees({ paise, style }: { paise: number; style?: StyleProp<TextStyle> }) {
  const reduced = useReducedMotion();
  const value = useSharedValue(paise);

  useEffect(() => {
    value.set(reduced ? paise : withTiming(paise, { duration: 400, easing: Easing.bezier(0.23, 1, 0.32, 1) }));
  }, [paise, reduced, value]);

  const animatedProps = useAnimatedProps(() => {
    const text = rupees(value.get());
    return { text, defaultValue: text } as object;
  });

  return (
    <AnimatedTextInput
      editable={false}
      underlineColorAndroid="transparent"
      accessibilityLabel={rupees(paise)}
      defaultValue={rupees(paise)}
      animatedProps={animatedProps}
      style={[styles.reset, style]}
    />
  );
}

const styles = StyleSheet.create({
  reset: { padding: 0, margin: 0, fontVariant: ['tabular-nums'] },
});
