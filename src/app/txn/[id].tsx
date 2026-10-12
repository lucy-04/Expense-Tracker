import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { StyleSheet, Switch, ToastAndroid, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Chip, EmojiBadge, Loading, Screen, SectionTitle, Tile, TileButton } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatPaise } from '@/core/money';
import { TYPE_EMOJI } from '@/core/categories';
import type { TxnType } from '@/core/types';
import { useQuery } from '@/db/changes';
import { countPayeeTransactions, getTransaction, setPayeeRule, updateTransaction, type Txn } from '@/db/repo';
import { TYPE_LABELS, useCategories } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';

const TYPES_BY_DIRECTION: Record<Txn['direction'], TxnType[]> = {
  debit: ['expense', 'transfer', 'investment'],
  credit: ['income', 'refund', 'transfer', 'investment'],
};

export default function TxnScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const { data: txn } = useQuery(() => getTransaction(db, id), [db, id]);
  if (txn === undefined) return <Loading />;
  if (txn === null) {
    return (
      <Screen>
        <ThemedText>Transaction not found.</ThemedText>
      </Screen>
    );
  }
  // Remount (fresh local state) if the stored row changes underneath, e.g. via a payee rule.
  return <Editor key={`${txn.id}:${txn.type}:${txn.categoryId}`} txn={txn} />;
}

function Editor({ txn }: { txn: Txn }) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { list: categories, emojiOf } = useCategories();
  const [type, setType] = useState<TxnType>(txn.type);
  const [categoryId, setCategoryId] = useState<string | null>(txn.categoryId);
  // Refunds belong to their purchase's payee; there's no meaningful payee to remember.
  const canRemember = txn.upiKind !== 'REFUND';
  // On by default for shops (the same shop is the same kind of spend every time), off for
  // person-to-person payments, where one transfer to a friend says little about the next.
  const [remember, setRemember] = useState(canRemember && txn.upiKind !== 'P2A');
  const payeeCount = useQuery(() => countPayeeTransactions(db, txn.payeeKey), [db, txn.payeeKey]).data;
  const [saving, setSaving] = useState(false);

  const credit = txn.direction === 'credit';
  const showCategories = type === 'expense' || type === 'refund';

  async function save() {
    setSaving(true);
    try {
      const cat = showCategories ? categoryId : null;
      let applied = 0;
      if (remember && canRemember) {
        applied = await setPayeeRule(db, {
          payeeKey: txn.payeeKey,
          displayName: txn.counterparty,
          categoryId: cat,
          // Only pin the type when the user changed it, so refunds/self-transfers keep working.
          type: type !== txn.type ? type : undefined,
        });
      }
      // Always pin the exact choice on this row too: a rule can't express every one-off.
      await updateTransaction(db, txn.id, { type, categoryId: cat });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Completion feedback: say exactly how far the change reached.
      ToastAndroid.show(
        applied > 1 ? `Updated ${applied} payments with ${txn.counterparty}` : 'Saved',
        ToastAndroid.SHORT,
      );
      router.back();
    } finally {
      setSaving(false);
    }
  }

  const emoji = showCategories ? emojiOf(categoryId) : TYPE_EMOJI[type];
  return (
    <Screen>
      {/* Android sheets have no built-in grabber; this one says "swipe me down". */}
      <View style={[styles.grabber, { backgroundColor: theme.tileBorder }]} accessibilityElementsHidden />
      <View style={styles.hero}>
        <EmojiBadge emoji={emoji} size={72} />
        <ThemedText type="title" tabular style={credit ? { color: theme.positive } : undefined}>
          {credit ? '+' : '−'}
          {formatPaise(txn.amount)}
        </ThemedText>
        <ThemedText type="heading" style={styles.center}>
          {txn.counterparty}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" tabular style={styles.center}>
          {formatDate(txn.date)}
          {txn.balance !== null ? `. Balance after: ${formatPaise(txn.balance)}` : ''}
        </ThemedText>
      </View>

      <SectionTitle>What was it?</SectionTitle>
      <View style={styles.wrap}>
        {TYPES_BY_DIRECTION[txn.direction].map((t) => (
          <Chip key={t} icon={TYPE_EMOJI[t]} label={TYPE_LABELS[t]} selected={type === t} onPress={() => setType(t)} />
        ))}
      </View>

      {showCategories ? (
        <>
          <SectionTitle>Category</SectionTitle>
          <View style={styles.grid}>
            {categories.map((c) => (
              <TileButton
                key={c.id}
                selected={categoryId === c.id}
                onPress={() => setCategoryId(c.id)}
                style={styles.answer}
                faceStyle={styles.answerFace}
                accessibilityLabel={c.name}>
                <ThemedText style={styles.answerEmoji}>{c.emoji}</ThemedText>
                <ThemedText type="smallBold" numberOfLines={2} style={styles.center}>
                  {c.name}
                </ThemedText>
              </TileButton>
            ))}
          </View>
        </>
      ) : null}

      {canRemember ? (
        <Tile>
          <View style={styles.row}>
            <View style={styles.flex}>
              <ThemedText type="smallBold">
                {payeeCount && payeeCount > 1
                  ? `Apply to all ${payeeCount} payments with “${txn.counterparty}”`
                  : `Remember for “${txn.counterparty}”`}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {remember ? 'Past and future payments with this payee get the same choice.' : 'Only this payment changes.'}
              </ThemedText>
            </View>
            <Switch value={remember} onValueChange={setRemember} trackColor={{ true: theme.primary, false: theme.track }} thumbColor="#FFFFFF" />
          </View>
        </Tile>
      ) : null}

      <Button title="Save" onPress={save} loading={saving} />

      <ThemedText type="code" selectable themeColor="textSecondary" style={styles.raw}>
        {txn.narration}
      </ThemedText>
    </Screen>
  );
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, marginTop: -Spacing.two },
  hero: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  answer: { width: '31.6%' },
  answerFace: { minHeight: 86, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: Spacing.two },
  answerEmoji: { fontSize: 26, lineHeight: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  raw: { marginTop: Spacing.three, textAlign: 'center' },
});
