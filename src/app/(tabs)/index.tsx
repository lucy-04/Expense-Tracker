import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedRupees } from '@/components/animated-number';
import { BarList, CalendarHeatmap, MonthBars } from '@/components/charts';
import { textStyles, ThemedText } from '@/components/themed-text';
import { Button, EmojiBadge, Empty, Loading, MIN_TARGET, PressableScale, ProgressBar, SectionTitle, Tile } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { formatPaise } from '@/core/money';
import { monthLabel, monthlyTotals, monthStats, shiftMonth } from '@/core/stats';
import { useQuery } from '@/db/changes';
import { listMonths, listPayeesToSort, listTransactions } from '@/db/repo';
import { useCategories } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';

const TREND_MONTHS = 6;

export default function DashboardScreen() {
  const db = useSQLiteContext();
  const months = useQuery(() => listMonths(db), [db]).data;
  const [chosen, setChosen] = useState<string | null>(null);
  const month = chosen ?? months?.[0] ?? null;

  // The band sits under the status bar, so its icons go light while this tab is showing.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('auto');
    }, []),
  );

  if (!months) return <Loading />;
  return <Dashboard month={month} months={months} onMonth={setChosen} />;
}

function Dashboard({ month, months, onMonth }: { month: string | null; months: string[]; onMonth: (m: string) => void }) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { nameOf, emojiOf } = useCategories();

  const from = month ? `${shiftMonth(month, -(TREND_MONTHS - 1))}-01` : '9999';
  const to = month ? `${month}-31` : '9999';
  const txns = useQuery(() => listTransactions(db, { from, to }), [db, from, to]).data;
  const toSort = useQuery(() => listPayeesToSort(db), [db]).data ?? [];

  const stats = useMemo(() => (txns && month ? monthStats(txns, month) : null), [txns, month]);
  const trend = useMemo(() => (txns && month ? monthlyTotals(txns, month, TREND_MONTHS) : []), [txns, month]);

  const idx = month ? months.indexOf(month) : -1;
  const older = months[idx + 1];
  const newer = idx > 0 ? months[idx - 1] : undefined;
  const net = stats ? stats.income - stats.spent : 0;

  const expenseCount = stats?.byCategory.reduce((a, c) => a + c.count, 0) ?? 0;
  const unsortedCount = stats?.byCategory.find((c) => c.categoryId === null)?.count ?? 0;

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}>
      {/* The band: month, the big number, and the two numbers that frame it */}
      <View style={[styles.band, { backgroundColor: theme.band, paddingTop: insets.top + Spacing.two }]}>
        <View style={styles.inner}>
          {month ? (
            <>
              <View style={styles.monthNav}>
                <NavArrow dir="prev" disabled={!older} onPress={() => older && onMonth(older)} />
                <View style={[styles.monthPill, { backgroundColor: theme.bandChip }]}>
                  <ThemedText type="smallBold" style={{ color: theme.onBand }}>
                    {monthLabel(month)}
                  </ThemedText>
                </View>
                <NavArrow dir="next" disabled={!newer} onPress={() => newer && onMonth(newer)} />
              </View>
              <ThemedText type="smallBold" style={[styles.bandLabel, { color: theme.onBandMuted }]}>
                You spent
              </ThemedText>
              <AnimatedRupees paise={stats?.spent ?? 0} style={[textStyles.display, styles.hero, { color: theme.onBand }]} />
              <View style={styles.bandChips}>
                <BandStat label="Income" value={formatPaise(stats?.income ?? 0, { decimals: false })} />
                <BandStat
                  label={net >= 0 ? 'Saved' : 'Overspent'}
                  value={formatPaise(Math.abs(net), { decimals: false })}
                />
              </View>
            </>
          ) : (
            <>
              <ThemedText type="title" style={[styles.welcome, { color: theme.onBand }]}>
                Hi there 👋
              </ThemedText>
              <ThemedText style={{ color: theme.onBandMuted }}>Let&apos;s see where your money goes.</ThemedText>
            </>
          )}
        </View>
      </View>

      <View style={[styles.inner, styles.body]}>
        {!month ? (
          <Empty
            emoji="📄"
            title="Import your first statement"
            body="Pick the Axis Bank statement PDF from your email. It's read entirely on this phone."
            action={<Button title="Import statement" onPress={() => router.navigate('/import')} />}
          />
        ) : !stats ? (
          <Loading />
        ) : (
          <>
            {toSort.length > 0 ? (
              <Tile style={styles.lesson}>
                <View style={styles.lessonHead}>
                  <EmojiBadge emoji="🧩" size={56} tint={theme.primarySoft} />
                  <View style={styles.flex}>
                    <ThemedText type="heading">Sort your payees</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {toSort.length} payee{toSort.length === 1 ? '' : 's'} to sort. Each one you sort stays sorted.
                    </ThemedText>
                  </View>
                </View>
                {expenseCount > 0 ? (
                  <View style={styles.lessonProgress}>
                    <View style={styles.flex}>
                      <ProgressBar value={(expenseCount - unsortedCount) / expenseCount} label="Payments sorted this month" />
                    </View>
                    <ThemedText type="smallBold" themeColor="textSecondary" tabular>
                      {Math.round(((expenseCount - unsortedCount) / expenseCount) * 100)}%
                    </ThemedText>
                  </View>
                ) : null}
                <Button title="Start sorting" onPress={() => router.push('/sort')} />
              </Tile>
            ) : null}

            <SectionTitle>Where it went</SectionTitle>
            <Tile>
              {stats.byCategory.length === 0 ? (
                <ThemedText themeColor="textSecondary">No spending this month.</ThemedText>
              ) : (
                <BarList
                  rows={stats.byCategory.map((c) => ({
                    key: c.categoryId ?? 'uncategorized',
                    label: nameOf(c.categoryId),
                    emoji: emojiOf(c.categoryId),
                    sublabel: `${c.count} payment${c.count === 1 ? '' : 's'}`,
                    value: c.amount,
                  }))}
                  onPress={(r) => router.navigate({ pathname: '/transactions', params: { month, category: r.key } })}
                />
              )}
            </Tile>

            <SectionTitle>Top places</SectionTitle>
            <Tile>
              <BarList
                rows={stats.byMerchant.slice(0, 6).map((m) => ({
                  key: m.payeeKey,
                  label: m.name,
                  sublabel: `${m.count} payment${m.count === 1 ? '' : 's'}`,
                  value: m.amount,
                }))}
                onPress={(r) => router.navigate({ pathname: '/transactions', params: { month, payee: r.key } })}
              />
            </Tile>

            <SectionTitle>Day by day</SectionTitle>
            <Tile>
              <CalendarHeatmap month={month} daily={stats.daily} />
            </Tile>

            <SectionTitle>Last {TREND_MONTHS} months</SectionTitle>
            <Tile>
              <MonthBars data={trend} selected={month} available={months} onSelect={onMonth} />
            </Tile>

            {stats.transferredIn + stats.transferredOut > 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.footnote} tabular>
                🔁 Moves between your own accounts aren&apos;t counted: {formatPaise(stats.transferredIn, { decimals: false })} in,{' '}
                {formatPaise(stats.transferredOut, { decimals: false })} out.
              </ThemedText>
            ) : null}
          </>
        )}
      </View>
    </ScrollView>
  );
}

function BandStat({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.bandStat, { backgroundColor: theme.bandChip }]}>
      <ThemedText type="small" style={{ color: theme.onBandMuted }}>
        {label}
      </ThemedText>
      <ThemedText type="heading" style={{ color: theme.onBand }} tabular>
        {value}
      </ThemedText>
    </View>
  );
}

function NavArrow({ dir, disabled, onPress }: { dir: 'prev' | 'next'; disabled: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={dir === 'prev' ? 'Previous month' : 'Next month'}
      accessibilityState={{ disabled }}
      scaleTo={0.88}
      style={[styles.arrow, { backgroundColor: theme.bandChip }, disabled && { opacity: 0.35 }]}>
      <ThemedText type="heading" style={{ color: theme.onBand }}>
        {dir === 'prev' ? '‹' : '›'}
      </ThemedText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingBottom: BottomTabInset + Spacing.four },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.three },
  band: { paddingBottom: Spacing.four, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.three },
  monthPill: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: 999 },
  arrow: { width: MIN_TARGET, height: MIN_TARGET, borderRadius: MIN_TARGET / 2, alignItems: 'center', justifyContent: 'center' },
  bandLabel: { marginTop: Spacing.one },
  hero: { marginTop: 2 },
  bandChips: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three },
  bandStat: { flex: 1, borderRadius: 16, paddingHorizontal: Spacing.three, paddingVertical: 10 },
  welcome: { marginTop: Spacing.four },
  body: { gap: Spacing.three, paddingTop: Spacing.four },
  lesson: { gap: Spacing.three },
  lessonHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  lessonProgress: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  footnote: { marginTop: Spacing.two },
});
