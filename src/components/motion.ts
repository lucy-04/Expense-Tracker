import { Easing, ReduceMotion, withSpring, withTiming, type EntryAnimationsValues, type LayoutAnimation } from 'react-native-reanimated';

// Shared motion vocabulary (animate-expo): one strong ease-out for anything that
// enters, exits or settles; never ease-in on UI.

/** Strong ease-out for Reanimated timing/layout animations. */
export const EASE_OUT_FN = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * Celebration entrance: scales up from 0.6 (never from 0) with a bouncy spring
 * and fades in. Rare moments only (import done, lesson done). With "Remove
 * animations" on, it lands in its final state immediately.
 */
export function popIn(_values: EntryAnimationsValues): LayoutAnimation {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.6 }] },
    animations: {
      opacity: withTiming(1, { duration: 180, easing: EASE_OUT_FN, reduceMotion: ReduceMotion.System }),
      transform: [{ scale: withSpring(1, { dampingRatio: 0.6, duration: 500, reduceMotion: ReduceMotion.System }) }],
    },
  };
}
