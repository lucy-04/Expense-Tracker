import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Chip, EmojiBadge, Empty, Field, PressableScale } from '@/components/ui';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { formatPaise, parseAmount } from '@/core/money';
import { TYPE_EMOJI } from '@/core/categories';
import { monthLabel } from '@/core/stats';
import type { TxnType } from '@/core/types';
import { useQuery } from '@/db/changes';
import { listMonths, listTransactions, type Txn, type TxnFilter } from '@/db/repo';
import { TYPE_LABELS, useCategories } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';

const TYPES: TxnType[] = ['expense', 'income', 'refund', 'transfer', 'investment'];

export default function TransactionsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const params = useLocalSearchParams<{ month?: string; category?: string; payee?: string }>();
  const { list: categories, nameOf, emojiOf } = useCategories();

  const [month, setMonth] = useState<string | undefined>(params.month);
  const [category, setCategory] = useState<string | undefined>(params.category);
  const [payee, setPayee] = useState<string | undefined>(params.payee);
  const [type, setType] = useState<TxnType | undefined>();
  const [search, setSearch] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');

  // Arriving from a dashboard tap replaces the filters with that tap's selection.
  const paramKey = `${params.month}|${params.category}|${params.payee}`;
  const [seenParams, setSeenParams] = useState(paramKey);
  if (seenParams !== paramKey) {
    setSeenParams(paramKey);
    setMonth(params.month);
    setCategory(params.category);
    setPayee(params.payee);
  }

  const filter: TxnFilter = {
    from: month ? `${month}-01` : undefined,
    to: month ? `${month}-31` : undefined,
    categoryId: category === 'uncategorized' ? null : category,
    payeeKey: payee,
    type: category ? (type ?? (category === 'uncategorized' ? 'expense' : undefined)) : type,
    search,
    minAmount: toPaise(minText),
    maxAmount: toPaise(maxText),
  };
  const key = JSON.stringify(filter);
  const { data } = useQuery(() => listTransactions(db, filter), [db, key]);
  const txns = useMemo(() => data ?? [], [data]);
  const months = useQuery(() => listMonths(db), [db]).data ?? [];
  // The payee filter arrives as a normalized key; show the name as the bank prints it.
  const payeeName = txns.find((t) => t.payeeKey === payee || t.linkedPayeeKey === payee)?.counterparty ?? payee;

  const sections = useMemo(() => {
    const by = new Map<string, Txn[]>();
    for (const t of txns) by.set(t.date, [...(by.get(t.date) ?? []), t]);
    return [...by.entries()].map(([date, data]) => ({ title: date, data }));
  }, [txns]);

  const out = txns.filter((t) => t.direction === 'debit').reduce((a, t) => a + t.amount, 0);
  const inn = txns.filter((t) => t.direction === 'credit').reduce((a, t) => a + t.amount, 0);

  const header = (
    <View style={styles.header}>
      <ThemedText type="title" accessibilityRole="header">
        Payments
      </ThemedText>
      <Field
        value={search}
        onChangeText={setSearch}
        placeholder="Search payee or description"
        clearable
        returnKeyType="search"
        autoCorrect={false}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="All time" selected={!month} onPress={() => setMonth(undefined)} />
        {months.map((m) => (
          <Chip key={m} label={monthLabel(m)} selected={month === m} onPress={() => setMonth(m)} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {payee ? <Chip label={`${payeeName}  ✕`} selected onPress={() => setPayee(undefined)} /> : null}
        {category ? (
          <Chip
            icon={emojiOf(category === 'uncategorized' ? null : category)}
            label={`${categoryLabel(category, nameOf)}  ✕`}
            selected
            onPress={() => setCategory(undefined)}
          />
        ) : null}
        <Chip icon="🎛️" label={showMore ? 'Fewer filters' : 'More filters'} selected={showMore} onPress={() => setShowMore((s) => !s)} />
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="All types" selected={!type} onPress={() => setType(undefined)} />
        {TYPES.map((t) => (
          <Chip key={t} icon={TYPE_EMOJI[t]} label={TYPE_LABELS[t]} selected={type === t} onPress={() => setType(type === t ? undefined : t)} />
        ))}
      </ScrollView>
      {showMore ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip
              icon={emojiOf(null)}
              label="Uncategorized"
              selected={category === 'uncategorized'}
              onPress={() => setCategory(category === 'uncategorized' ? undefined : 'uncategorized')}
            />
            {categories.map((c) => (
              <Chip
                key={c.id}
                icon={c.emoji}
                label={c.name}
                selected={category === c.id}
                onPress={() => setCategory(category === c.id ? undefined : c.id)}
              />
            ))}
          </ScrollView>
          <View style={styles.amounts}>
            <Field style={styles.flex} value={minText} onChangeText={setMinText} placeholder="Min ₹" keyboardType="decimal-pad" returnKeyType="done" clearable />
            <Field style={styles.flex} value={maxText} onChangeText={setMaxText} placeholder="Max ₹" keyboardType="decimal-pad" returnKeyType="done" clearable />
          </View>
        </>
      ) : null}
      <ThemedText type="small" themeColor="textSecondary" tabular>
        {txns.length} payment{txns.length === 1 ? '' : 's'}: {formatPaise(out, { decimals: false })} out, {formatPaise(inn, { decimals: false })} in
      </ThemedText>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: theme.background }]}>
      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={header}
        ListEmptyComponent={<Empty emoji="🔍" title="Nothing matches" body="Try clearing a filter or searching for something shorter." />}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <ThemedText type="smallBold" themeColor="textSecondary" style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
            {formatDate(section.title)}
          </ThemedText>
        )}
        renderItem={({ item }) => <TxnRow txn={item} nameOf={nameOf} emojiOf={emojiOf} />}
      />
    </SafeAreaView>
  );
}

function TxnRow({
  txn,
  nameOf,
  emojiOf,
}: {
  txn: Txn;
  nameOf: (id: string | null) => string;
  emojiOf: (id: string | null) => string;
}) {
  const theme = useTheme();
  const credit = txn.direction === 'credit';
  const sub =
    txn.type === 'expense'
      ? txn.categoryId === null
        ? 'Needs a category'
        : nameOf(txn.categoryId)
      : txn.type === 'refund' && txn.categoryId
        ? `Refund for ${nameOf(txn.categoryId)}`
        : TYPE_LABELS[txn.type];
  const emoji = txn.type === 'expense' ? emojiOf(txn.categoryId) : TYPE_EMOJI[txn.type];
  return (
    // Full-width rows highlight instead of scaling: a 0.97 scale visibly shrinks a whole row.
    <PressableScale
      onPress={() => router.push({ pathname: '/txn/[id]', params: { id: txn.id } })}
      accessibilityRole="button"
      scaleTo={1}
      style={styles.row}
      pressedStyle={{ backgroundColor: theme.tilePressed }}>
      <EmojiBadge emoji={emoji} size={44} />
      <View style={styles.flex}>
        <ThemedText type="smallBold" numberOfLines={1} style={styles.rowName}>
          {txn.counterparty}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {sub}
          {txn.note ? `, “${txn.note}”` : ''}
        </ThemedText>
      </View>
      <ThemedText type="smallBold" tabular style={[styles.amount, credit ? { color: theme.positive } : undefined]}>
        {credit ? '+' : '−'}
        {formatPaise(txn.amount)}
      </ThemedText>
    </PressableScale>
  );
}

function categoryLabel(id: string, nameOf: (id: string | null) => string) {
  return id === 'uncategorized' ? 'Uncategorized' : nameOf(id);
}

function toPaise(text: string): number | undefined {
  const t = text.trim();
  if (!t) return undefined;
  return parseAmount(t.includes('.') ? t : `${t}.00`) ?? undefined;
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingHorizontal: Spacing.three, paddingBottom: BottomTabInset + Spacing.four },
  header: { gap: Spacing.three, paddingTop: Spacing.four, paddingBottom: Spacing.two },
  chips: { gap: Spacing.two, paddingRight: Spacing.three },
  amounts: { flexDirection: 'row', gap: Spacing.two },
  sectionHeader: { paddingTop: Spacing.four, paddingBottom: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 64,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    marginHorizontal: -Spacing.two,
    borderRadius: 16,
  },
  rowName: { fontSize: 16, lineHeight: 21 },
  amount: { fontSize: 16, lineHeight: 21 },
});
