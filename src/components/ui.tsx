import { useState, type ReactNode, type Ref } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type GestureResponderEvent,
  type Insets,
  type PressableProps,
  type ScrollViewProps,
  type StyleProp,
  type TextInputProps,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import Animated, { cubicBezier, useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Fonts, LipHeight, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);

/** Android's minimum touch target. */
export const MIN_TARGET = 48;

/** hitSlop that grows a visual of `size` (height) to a 48dp touch target. */
export function slopFor(size: number): Insets {
  const v = Math.max(0, Math.ceil((MIN_TARGET - size) / 2));
  return { top: v, bottom: v, left: 4, right: 4 };
}

function usePressed(disabled?: boolean | null) {
  const [pressed, setPressed] = useState(false);
  const handlers = {
    onPressIn: () => setPressed(true),
    onPressOut: () => setPressed(false),
  };
  return [pressed && !disabled, handlers] as const;
}

// ── Pushable: the Duolingo press ───────────────────────────────────────────────

type PushableProps = Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode;
  face: string;
  lip: string;
  /** Optional 2px outline on the face (secondary buttons, tiles). */
  outline?: string;
  radius?: number;
  lipHeight?: number;
  /** Outer layout (width, flex, margins). */
  style?: StyleProp<ViewStyle>;
  /** Inner layout of the face (padding, alignment). */
  faceStyle?: StyleProp<ViewStyle>;
};

/**
 * A flat face sitting on a darker lip. On press-in the face drops onto the lip
 * (100ms ease-out), so the control physically "goes down" under your finger.
 * With "Remove animations" on, it still goes down, just without the tween.
 */
export function Pushable({
  children,
  face,
  lip,
  outline,
  radius = Radius.button,
  lipHeight = LipHeight,
  style,
  faceStyle,
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: PushableProps) {
  const reduced = useReducedMotion();
  const [down, pressHandlers] = usePressed(disabled);
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPressIn={(e: GestureResponderEvent) => {
        pressHandlers.onPressIn();
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        pressHandlers.onPressOut();
        onPressOut?.(e);
      }}
      style={style}>
      <View style={[StyleSheet.absoluteFill, { top: lipHeight, borderRadius: radius, backgroundColor: lip }]} />
      <Animated.View
        style={[
          {
            marginBottom: lipHeight,
            borderRadius: radius,
            backgroundColor: face,
            borderWidth: outline ? 2 : 0,
            borderColor: outline,
            transform: [{ translateY: down ? lipHeight : 0 }],
            transitionProperty: 'transform',
            transitionDuration: reduced ? 0 : 100,
            transitionTimingFunction: EASE_OUT,
          },
          faceStyle,
        ]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// ── Buttons ────────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'coral' | 'success' | 'danger';

type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  title: string;
  variant?: ButtonVariant;
  icon?: string;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, variant = 'primary', icon, loading, disabled, style, ...rest }: ButtonProps) {
  const theme = useTheme();
  const off = disabled || loading;
  const palette: Record<ButtonVariant, { face: string; lip: string; text: string; outline?: string }> = {
    primary: { face: theme.primary, lip: theme.primaryLip, text: theme.onPrimary },
    coral: { face: theme.coral, lip: theme.coralLip, text: '#FFFFFF' },
    success: { face: theme.success, lip: theme.successLip, text: '#FFFFFF' },
    danger: { face: theme.danger, lip: theme.dangerLip, text: '#FFFFFF' },
    secondary: { face: theme.tile, lip: theme.tileLip, text: theme.primary, outline: theme.tileBorder },
  };
  const p = off && variant !== 'secondary' ? { face: theme.track, lip: theme.tileLip, text: theme.muted } : palette[variant];
  return (
    <Pushable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      accessibilityLabel={title}
      disabled={off}
      face={p.face}
      lip={p.lip}
      outline={p.outline}
      style={style}
      faceStyle={styles.buttonFace}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={p.text} />
      ) : (
        <View style={styles.buttonRow}>
          {icon ? <ThemedText style={styles.buttonIcon}>{icon}</ThemedText> : null}
          <ThemedText style={[styles.buttonText, { color: off && variant === 'secondary' ? theme.muted : p.text }]}>{title}</ThemedText>
        </View>
      )}
    </Pushable>
  );
}

/** Text-only action ("Rename", "Forget"); padded and slopped to a 48dp target. */
export function LinkButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  const theme = useTheme();
  return (
    <PressableScale onPress={onPress} hitSlop={slopFor(36)} style={styles.link} accessibilityRole="button" scaleTo={0.94}>
      <ThemedText type="smallBold" style={{ color: danger ? theme.danger : theme.primary }}>
        {label}
      </ThemedText>
    </PressableScale>
  );
}

// ── Chips ──────────────────────────────────────────────────────────────────────

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: string }) {
  const theme = useTheme();
  return (
    <Pushable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={slopFor(CHIP_HEIGHT + 3)}
      face={selected ? theme.primarySoft : theme.tile}
      lip={selected ? theme.primary : theme.tileLip}
      outline={selected ? theme.primary : theme.tileBorder}
      lipHeight={3}
      radius={Radius.badge}
      faceStyle={styles.chipFace}>
      <View style={styles.buttonRow}>
        {icon ? <ThemedText style={styles.chipIcon}>{icon}</ThemedText> : null}
        <ThemedText type="smallBold" style={{ color: selected ? theme.primary : theme.text }}>
          {label}
        </ThemedText>
      </View>
    </Pushable>
  );
}

// ── Tiles ──────────────────────────────────────────────────────────────────────

/** A card in the Duolingo style: 2px outline with a thicker bottom edge, no shadow. */
export function Tile({ style, ...rest }: ViewProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: theme.tile, borderColor: theme.tileBorder, borderBottomColor: theme.tileLip },
        style,
      ]}
      {...rest}
    />
  );
}

/** A tile you can press: it pushes down like a button. */
export function TileButton({
  children,
  selected,
  style,
  faceStyle,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  faceStyle?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <Pushable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      face={selected ? theme.primarySoft : theme.tile}
      lip={selected ? theme.primary : theme.tileLip}
      outline={selected ? theme.primary : theme.tileBorder}
      style={style}
      faceStyle={[styles.tileFace, faceStyle]}
      {...rest}>
      {children}
    </Pushable>
  );
}

/** Kept as the name of the old grey card; now a tile. */
export const Card = Tile;

/** Rounded square holding a big emoji: the app's icon language. */
export function EmojiBadge({ emoji, size = 44, tint }: { emoji: string; size?: number; tint?: string }) {
  const theme = useTheme();
  return (
    <View
      style={[styles.badge, { width: size, height: size, borderRadius: size * 0.32, backgroundColor: tint ?? theme.badge }]}
      importantForAccessibility="no-hide-descendants">
      <ThemedText style={{ fontSize: size * 0.5, lineHeight: size * 0.62 }}>{emoji}</ThemedText>
    </View>
  );
}

// ── Progress ───────────────────────────────────────────────────────────────────

/**
 * Thick rounded bar with a light highlight stripe along the top of the fill.
 * The fill is absolutely positioned, so animating its width never re-lays-out siblings.
 */
export function ProgressBar({ value, color, height = 14, label }: { value: number; color?: string; height?: number; label?: string }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: theme.track }]}>
      <Animated.View
        style={[
          styles.fill,
          {
            width: `${pct > 0 ? Math.max(pct, 4) : 0}%`,
            borderRadius: height / 2,
            backgroundColor: color ?? theme.primary,
            transitionProperty: 'width',
            transitionDuration: reduced ? 0 : 280,
            transitionTimingFunction: EASE_OUT,
          },
        ]}>
        <View style={[styles.shine, { top: height * 0.22, height: Math.max(3, height * 0.22), borderRadius: height }]} />
      </Animated.View>
    </View>
  );
}

// ── Plain press feedback (rows, chart marks, calendar days) ────────────────────

type PressableScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Visual style while pressed, e.g. a highlight. Applied on press-in, instantly. */
  pressedStyle?: StyleProp<ViewStyle>;
  /** 0.97 for most controls; 1 disables the scale (full-width rows). */
  scaleTo?: number;
};

/** Press feedback for things that aren't pushable buttons: a quick scale on press-in. */
export function PressableScale({ style, pressedStyle, scaleTo = 0.97, onPressIn, onPressOut, disabled, ...rest }: PressableScaleProps) {
  const reduced = useReducedMotion();
  const [down, pressHandlers] = usePressed(disabled);
  // Build on the element's own opacity (e.g. a disabled control's 0.4) instead of replacing it.
  const ownOpacity = StyleSheet.flatten([style, down && pressedStyle])?.opacity;
  const baseOpacity = typeof ownOpacity === 'number' ? ownOpacity : 1;
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e: GestureResponderEvent) => {
        pressHandlers.onPressIn();
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        pressHandlers.onPressOut();
        onPressOut?.(e);
      }}
      style={[
        style,
        down && pressedStyle,
        {
          transform: [{ scale: down && !reduced ? scaleTo : 1 }],
          opacity: down && reduced ? baseOpacity * 0.7 : baseOpacity,
          transitionProperty: ['transform', 'opacity'],
          transitionDuration: 120,
          transitionTimingFunction: EASE_OUT,
        },
      ]}
    />
  );
}

// ── Layout ─────────────────────────────────────────────────────────────────────

/** Scrolling page body with safe-area top padding and room for the tab bar. */
export function Screen({ children, scroll = true, title, ...rest }: ScrollViewProps & { scroll?: boolean; title?: string }) {
  const theme = useTheme();
  const body = (
    <View style={styles.screenInner}>
      {title ? (
        <ThemedText type="title" accessibilityRole="header" style={styles.screenTitle}>
          {title}
        </ThemedText>
      ) : null}
      {children}
    </View>
  );
  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: theme.background }]}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled" {...rest}>
          {body}
        </ScrollView>
      ) : (
        <View style={[styles.flex, styles.screenContent]}>{body}</View>
      )}
    </SafeAreaView>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <ThemedText type="heading" accessibilityRole="header">
        {children}
      </ThemedText>
      {right}
    </View>
  );
}

// ── Inputs ─────────────────────────────────────────────────────────────────────

type FieldProps = Omit<TextInputProps, 'style'> & {
  /** Show a clear (✕) button while there's text. Android has no built-in one. */
  clearable?: boolean;
  /** Layout of the field within its row (e.g. flex: 1). */
  style?: StyleProp<ViewStyle>;
  ref?: Ref<TextInput>;
};

export function Field({ clearable, style, ref, onFocus, onBlur, ...props }: FieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const showClear = clearable && !!props.value && props.editable !== false;
  return (
    <View style={[styles.fieldWrap, style]}>
      <TextInput
        ref={ref}
        placeholderTextColor={theme.muted}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...props}
        style={[
          styles.field,
          {
            color: theme.text,
            backgroundColor: focused ? theme.tile : theme.badge,
            borderColor: focused ? theme.primary : theme.tileBorder,
          },
          showClear && styles.fieldWithClear,
        ]}
      />
      {showClear ? (
        <PressableScale
          onPress={() => props.onChangeText?.('')}
          accessibilityRole="button"
          accessibilityLabel="Clear"
          scaleTo={0.85}
          style={styles.clear}>
          <View style={[styles.clearDot, { backgroundColor: theme.muted }]}>
            <ThemedText style={[styles.clearX, { color: theme.tile }]}>✕</ThemedText>
          </View>
        </PressableScale>
      ) : null}
    </View>
  );
}

// ── States ─────────────────────────────────────────────────────────────────────

export function Loading() {
  const theme = useTheme();
  return (
    <View style={[styles.flex, styles.center, { backgroundColor: theme.background }]}>
      <ActivityIndicator color={theme.primary} />
    </View>
  );
}

/** Work in progress: a sliding bar and what's happening. Nothing to tap. */
export function Busy({ label }: { label: string }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  return (
    <Tile style={styles.busy} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ThemedText type="smallBold">{label}</ThemedText>
      {reduced ? (
        <ActivityIndicator color={theme.primary} />
      ) : (
        <View style={[styles.track, { height: 14, borderRadius: 7, backgroundColor: theme.track }]}>
          <Animated.View
            style={[
              styles.indeterminate,
              {
                backgroundColor: theme.primary,
                animationName: SLIDE,
                animationDuration: 1100,
                animationIterationCount: 'infinite',
                // Constant motion reads as steady progress only when it's linear.
                animationTimingFunction: 'linear',
              },
            ]}
          />
        </View>
      )}
    </Tile>
  );
}

const SLIDE = {
  from: { transform: [{ translateX: '-100%' }] },
  to: { transform: [{ translateX: '300%' }] },
};

export function Empty({ emoji, title, body, action }: { emoji?: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <Tile style={styles.empty}>
      {emoji ? <EmojiBadge emoji={emoji} size={72} /> : null}
      <ThemedText type="heading" style={styles.centerText}>
        {title}
      </ThemedText>
      {body ? (
        <ThemedText themeColor="textSecondary" style={styles.centerText}>
          {body}
        </ThemedText>
      ) : null}
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </Tile>
  );
}

const CHIP_HEIGHT = 38;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  screenContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    alignItems: 'center',
  },
  screenInner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
  screenTitle: { marginTop: Spacing.two, marginBottom: Spacing.one },
  sectionTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.three },

  buttonFace: { minHeight: 52, paddingHorizontal: Spacing.four, alignItems: 'center', justifyContent: 'center' },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  buttonIcon: { fontSize: 18, lineHeight: 22 },
  buttonText: { fontFamily: Fonts.extraBold, fontSize: 17, lineHeight: 22, letterSpacing: 0.2 },
  link: { minHeight: 36, paddingHorizontal: Spacing.two, justifyContent: 'center' },

  chipFace: { minHeight: CHIP_HEIGHT, paddingHorizontal: 14, justifyContent: 'center' },
  chipIcon: { fontSize: 15, lineHeight: 19 },

  tile: { borderRadius: Radius.tile, borderWidth: 2, borderBottomWidth: LipHeight, padding: Spacing.three, gap: Spacing.two },
  tileFace: { padding: Spacing.three },
  badge: { alignItems: 'center', justifyContent: 'center' },

  track: { width: '100%', overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  shine: { position: 'absolute', left: 8, right: 8, backgroundColor: 'rgba(255,255,255,0.32)' },
  indeterminate: { width: '30%', height: '100%', borderRadius: 7 },

  fieldWrap: { justifyContent: 'center' },
  field: {
    minHeight: 52,
    borderWidth: 2,
    borderRadius: Radius.badge,
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: Fonts.regular,
  },
  fieldWithClear: { paddingRight: MIN_TARGET },
  clear: { position: 'absolute', right: 2, width: MIN_TARGET, height: MIN_TARGET, alignItems: 'center', justifyContent: 'center' },
  clearDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  clearX: { fontSize: 11, lineHeight: 14, fontFamily: Fonts.black },

  busy: { gap: Spacing.three, paddingVertical: Spacing.four },
  empty: { alignItems: 'center', paddingVertical: Spacing.five, paddingHorizontal: Spacing.four, gap: Spacing.three },
  emptyAction: { alignSelf: 'stretch', marginTop: Spacing.two },
});
