import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { EmojiBadge, PressableScale, ProgressBar } from '@/components/ui';
import { SequentialBlue, Spacing } from '@/constants/theme';
import { formatPaise } from '@/core/money';
import { monthLabel, type MonthTotal } from '@/core/stats';
import { useTheme } from '@/hooks/use-theme';

// Marks follow the dataviz rules (one hue for magnitude, two validated hues for
// spent vs income, text in text colours, tap = tooltip) dressed in the app's
// rounded, chunky style.

export type BarRow = { key: string; label: string; sublabel?: string; value: number; emoji?: string };

/** "Where it went": each row an emoji badge, name, amount and a thick share bar. */
export function BarList({ rows, onPress }: { rows: BarRow[]; onPress?: (row: BarRow) => void }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View style={styles.barList}>
      {rows.map((r) => (
        <PressableScale
          key={r.key}
          onPress={onPress ? () => onPress(r) : undefined}
          disabled={!onPress}
          accessibilityRole={onPress ? 'button' : undefined}
          accessibilityLabel={`${r.label}, ${formatPaise(r.value)}${r.sublabel ? `, ${r.sublabel}` : ''}`}
          scaleTo={0.98}
          style={styles.barRow}>
          {r.emoji ? <EmojiBadge emoji={r.emoji} size={44} /> : <InitialBadge name={r.label} />}
          <View style={styles.barBody}>
            <View style={styles.barLabels}>
              <ThemedText type="smallBold" numberOfLines={1} style={styles.flex}>
                {r.label}
              </ThemedText>
              <ThemedText type="smallBold" tabular>
                {formatPaise(r.value, { decimals: false })}
              </ThemedText>
            </View>
            <ProgressBar value={Math.max(0, r.value) / max} height={12} />
            {r.sublabel ? (
              <ThemedText type="small" themeColor="textSecondary">
                {r.sublabel}
              </ThemedText>
            ) : null}
          </View>
        </PressableScale>
      ))}
    </View>
  );
}

/** Merchants have no emoji; a lettered badge keeps the rows aligned. */
function InitialBadge({ name }: { name: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.initial, { backgroundColor: theme.primarySoft }]} importantForAccessibility="no-hide-descendants">
      <ThemedText type="heading" style={{ color: theme.primary }}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </ThemedText>
    </View>
  );
}

/** Spent vs income per month: two series, one axis, legend + tap readout. */
export function MonthBars({
  data,
  selected,
  available,
  onSelect,
}: {
  data: MonthTotal[];
  selected: string;
  /** Months that have imported data; the rest are shown but can't be opened. */
  available: string[];
  onSelect: (month: string) => void;
}) {
  const theme = useTheme();
  const max = Math.max(1, ...data.flatMap((d) => [d.spent, d.income]));
  const sel = data.find((d) => d.month === selected);
  const H = 132;
  return (
    <View style={styles.gap}>
      <View style={styles.legend}>
        <LegendSwatch color={theme.series1} label="Spent" />
        <LegendSwatch color={theme.series2} label="Income" />
      </View>
      <View style={[styles.monthPlot, { height: H }]}>
        {data.map((d) => {
          const isSel = d.month === selected;
          const hasData = available.includes(d.month);
          return (
            <PressableScale
              key={d.month}
              onPress={() => onSelect(d.month)}
              disabled={!hasData}
              accessibilityRole="button"
              accessibilityState={{ selected: isSel, disabled: !hasData }}
              accessibilityLabel={
                hasData
                  ? `${monthLabel(d.month)}: spent ${formatPaise(d.spent)}, income ${formatPaise(d.income)}`
                  : `${monthLabel(d.month)}: no statement imported`
              }
              scaleTo={0.94}
              style={[styles.monthCol, isSel && { backgroundColor: theme.primarySoft }]}>
              <View style={[styles.vbar, { height: barH(d.spent, max, H), backgroundColor: theme.series1 }]} />
              <View style={[styles.vbar, { height: barH(d.income, max, H), backgroundColor: theme.series2 }]} />
            </PressableScale>
          );
        })}
      </View>
      <View style={[styles.baseline, { backgroundColor: theme.tileBorder }]} />
      <View style={styles.monthLabels}>
        {data.map((d) => (
          <ThemedText
            key={d.month}
            type="smallBold"
            themeColor={d.month === selected ? 'text' : 'textSecondary'}
            style={[styles.monthLabel, !available.includes(d.month) && styles.unavailable]}>
            {monthLabel(d.month, 'short')}
          </ThemedText>
        ))}
      </View>
      {sel ? (
        <ThemedText type="small" themeColor="textSecondary" tabular>
          {monthLabel(sel.month)}: spent {formatPaise(sel.spent, { decimals: false })}, income{' '}
          {formatPaise(sel.income, { decimals: false })}
        </ThemedText>
      ) : null}
      {data.some((d) => !available.includes(d.month)) ? (
        <ThemedText type="small" themeColor="textSecondary">
          Faded months have no statement imported yet.
        </ThemedText>
      ) : null}
    </View>
  );
}

function barH(v: number, max: number, H: number) {
  if (v <= 0) return 0;
  return Math.max(6, (v / max) * (H - 12));
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

/** Daily spend as a Monday-first calendar, single-hue sequential ramp; tap a day to read it. */
export function CalendarHeatmap({ month, daily }: { month: string; daily: number[] }) {
  const theme = useTheme();
  const [picked, setPicked] = useState<number | null>(null);
  const [y, m] = month.split('-').map(Number);
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday = 0
  const max = Math.max(1, ...daily);
  const cells: (number | null)[] = [...Array.from({ length: lead }, () => null), ...daily.map((_, i) => i)];
  while (cells.length % 7 !== 0) cells.push(null);

  const colorFor = (v: number) => {
    if (v <= 0) return theme.track;
    const bin = Math.min(SequentialBlue.length - 1, Math.floor((v / max) * SequentialBlue.length));
    return SequentialBlue[bin];
  };
  const pickedDay = picked !== null && picked < daily.length ? picked : null;

  return (
    <View style={styles.gap}>
      <View style={styles.calRow}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <ThemedText key={i} type="smallBold" themeColor="textSecondary" style={styles.calHead}>
            {d}
          </ThemedText>
        ))}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, row) => (
        <View key={row} style={styles.calRow}>
          {cells.slice(row * 7, row * 7 + 7).map((day, i) =>
            day === null ? (
              <View key={i} style={styles.calCell} />
            ) : (
              <PressableScale
                key={i}
                onPress={() => setPicked(day)}
                scaleTo={0.86}
                accessibilityRole="button"
                accessibilityLabel={`${day + 1} ${monthLabel(month)}: ${formatPaise(Math.max(0, daily[day]))}`}
                style={[
                  styles.calCell,
                  { backgroundColor: colorFor(daily[day]) },
                  pickedDay === day && { borderWidth: 3, borderColor: theme.text },
                ]}
              />
            ),
          )}
        </View>
      ))}
      <View style={styles.calFooter}>
        <ThemedText type="smallBold" themeColor={pickedDay !== null ? 'text' : 'textSecondary'} style={styles.flex} tabular>
          {pickedDay !== null
            ? `${pickedDay + 1} ${monthLabel(month, 'short')}: ${formatPaise(Math.max(0, daily[pickedDay]), { decimals: false })}`
            : 'Tap a day'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Less{' '}
        </ThemedText>
        {SequentialBlue.map((c) => (
          <View key={c} style={[styles.rampSwatch, { backgroundColor: c }]} />
        ))}
        <ThemedText type="small" themeColor="textSecondary">
          {' '}More
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: Spacing.two },
  barList: { gap: Spacing.two },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.one },
  barBody: { flex: 1, gap: 6 },
  barLabels: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  initial: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', gap: Spacing.three },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 14, height: 14, borderRadius: 5 },
  monthPlot: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  monthCol: {
    flex: 1,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 3,
    borderRadius: 12,
    paddingTop: 6,
  },
  vbar: { width: 12, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  baseline: { height: 2, borderRadius: 1 },
  monthLabels: { flexDirection: 'row', gap: 4 },
  monthLabel: { flex: 1, textAlign: 'center' },
  unavailable: { opacity: 0.4 },
  calRow: { flexDirection: 'row', gap: 4 },
  calHead: { flex: 1, textAlign: 'center' },
  calCell: { flex: 1, aspectRatio: 1, borderRadius: 8 },
  calFooter: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  rampSwatch: { width: 12, height: 12, borderRadius: 4 },
});
