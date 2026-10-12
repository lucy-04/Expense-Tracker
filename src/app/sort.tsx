import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInRight, FadeOutLeft, SlideInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EASE_OUT_FN, popIn } from '@/components/motion';
import { ThemedText } from '@/components/themed-text';
import { Button, EmojiBadge, Loading, PressableScale, ProgressBar, TileButton } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { TYPE_EMOJI } from '@/core/categories';
import { formatPaise } from '@/core/money';
import { useQuery } from '@/db/changes';
import { listPayeesToSort, setPayeeRule, type PayeeToSort } from '@/db/repo';
import { useCategories } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';

/** An answer is a category, or "this is my own account" (a transfer, not spending). */
type Answer = { kind: 'category'; id: string } | { kind: 'transfer' };

type Result = { name: string; emoji: string; label: string; applied: number };

export default function SortScreen() {
  const db = useSQLiteContext();
  const live = useQuery(() => listPayeesToSort(db), [db]).data;
  // Freeze the deck when the lesson starts; sorting a payee removes it from the live query.
  const [deck, setDeck] = useState<PayeeToSort[] | null>(null);
  if (deck === null && live) setDeck(live);

  if (!deck) return <Loading />;
  return <Lesson deck={deck} />;
}

function Lesson({ deck }: { deck: PayeeToSort[] }) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { list: categories } = useCategories();
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [saving, setSaving] = useState(false);
  const [sortedCount, setSortedCount] = useState(0);

  const done = index >= deck.length;
  const payee = deck[index];
  const progress = deck.length === 0 ? 1 : (index + (result ? 1 : 0)) / deck.length;

  function choose(a: Answer) {
    if (result) return;
    setAnswer(a);
    Haptics.selectionAsync();
  }

  async function save() {
    if (!answer || !payee) return;
    setSaving(true);
    try {
      const applied = await setPayeeRule(db, {
        payeeKey: payee.payeeKey,
        displayName: payee.name,
        categoryId: answer.kind === 'category' ? answer.id : null,
        type: answer.kind === 'transfer' ? 'transfer' : undefined,
      });
      const cat = answer.kind === 'category' ? categories.find((c) => c.id === answer.id) : undefined;
      setResult({
        name: payee.name,
        emoji: cat?.emoji ?? TYPE_EMOJI.transfer,
        label: cat?.name ?? 'Own account',
        applied,
      });
      setSortedCount((n) => n + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setSaving(false);
    }
  }

  function next() {
    setResult(null);
    setAnswer(null);
    setIndex((i) => i + 1);
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.flex, { backgroundColor: theme.background }]}>
      <View style={[styles.inner, styles.topBar]}>
        <PressableScale
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          scaleTo={0.85}
          style={styles.close}>
          <ThemedText type="heading" themeColor="muted">
            ✕
          </ThemedText>
        </PressableScale>
        <View style={styles.flex}>
          <ProgressBar value={progress} height={16} color={theme.success} label="Payees sorted" />
        </View>
      </View>

      {done ? (
        <Celebration sorted={sortedCount} total={deck.length} />
      ) : (
        <>
          <ScrollView contentContainerStyle={[styles.inner, styles.content]} showsVerticalScrollIndicator={false}>
            <Animated.View key={payee.payeeKey} entering={FadeInRight.duration(260).easing(EASE_OUT_FN)} exiting={FadeOutLeft.duration(180).easing(EASE_OUT_FN)} style={styles.question}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Where does this go?
              </ThemedText>
              <ThemedText type="title">{payee.name}</ThemedText>
              <ThemedText themeColor="textSecondary" tabular>
                {payee.count} payment{payee.count === 1 ? '' : 's'}, {formatPaise(payee.total, { decimals: false })} in total
                {payee.notes ? `. Note: “${payee.notes.split(',')[0]}”` : ''}
              </ThemedText>
              {payee.upiKind === 'P2A' ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Sent to a person&apos;s account.
                </ThemedText>
              ) : null}

              <View style={styles.grid}>
                {categories.map((c) => (
                  <AnswerTile
                    key={c.id}
                    emoji={c.emoji}
                    label={c.name}
                    selected={answer?.kind === 'category' && answer.id === c.id}
                    onPress={() => choose({ kind: 'category', id: c.id })}
                  />
                ))}
                <AnswerTile
                  emoji={TYPE_EMOJI.transfer}
                  label="My own account"
                  selected={answer?.kind === 'transfer'}
                  onPress={() => choose({ kind: 'transfer' })}
                />
              </View>
            </Animated.View>
          </ScrollView>

          {result ? (
            <Animated.View
              entering={SlideInDown.duration(260).easing(EASE_OUT_FN)}
              style={[styles.banner, { backgroundColor: theme.successSoft }]}
              accessibilityLiveRegion="polite">
              <View style={[styles.inner, styles.bannerInner]}>
                <View style={styles.bannerHead}>
                  <EmojiBadge emoji="✅" size={44} tint={theme.background} />
                  <View style={styles.flex}>
                    <ThemedText type="heading" style={{ color: theme.successText }}>
                      Nice!
                    </ThemedText>
                    <ThemedText style={{ color: theme.successText }}>
                      {result.name} → {result.emoji} {result.label}
                      {result.applied > 1 ? `, ${result.applied} payments updated` : ''}
                    </ThemedText>
                  </View>
                </View>
                <Button title="Continue" variant="success" onPress={next} />
              </View>
            </Animated.View>
          ) : (
            <View style={[styles.footer, { borderTopColor: theme.tileBorder }]}>
              <View style={[styles.inner, styles.footerRow]}>
                <Button title="Skip" variant="secondary" onPress={next} style={styles.skip} />
                <Button title="Save" onPress={save} disabled={!answer} loading={saving} style={styles.flex} />
              </View>
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

function AnswerTile({ emoji, label, selected, onPress }: { emoji: string; label: string; selected: boolean; onPress: () => void }) {
  return (
    <TileButton selected={selected} onPress={onPress} style={styles.answer} faceStyle={styles.answerFace} accessibilityLabel={label}>
      <ThemedText style={styles.answerEmoji}>{emoji}</ThemedText>
      <ThemedText type="smallBold" numberOfLines={2} style={styles.answerLabel}>
        {label}
      </ThemedText>
    </TileButton>
  );
}

function Celebration({ sorted, total }: { sorted: number; total: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.inner, styles.celebrate]}>
      <Animated.View entering={popIn}>
        <EmojiBadge emoji={sorted > 0 ? '🎉' : '👋'} size={120} tint={theme.primarySoft} />
      </Animated.View>
      <Animated.View entering={FadeIn.delay(200).duration(280).easing(EASE_OUT_FN)} style={styles.celebrateText}>
        <ThemedText type="title" style={styles.center}>
          {sorted === total && total > 0 ? 'All sorted!' : sorted > 0 ? 'Nice work!' : 'See you next time'}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {sorted > 0
            ? `You sorted ${sorted} payee${sorted === 1 ? '' : 's'}. Their future payments will sort themselves.`
            : 'Skipped payees stay on your dashboard until you sort them.'}
        </ThemedText>
      </Animated.View>
      <View style={styles.celebrateAction}>
        <Button title="Back to dashboard" onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.three },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  content: { paddingTop: Spacing.three, paddingBottom: Spacing.five },
  question: { gap: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.three },
  answer: { width: '48.5%' },
  answerFace: { minHeight: 92, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: Spacing.two },
  answerEmoji: { fontSize: 30, lineHeight: 36 },
  answerLabel: { textAlign: 'center' },
  footer: { borderTopWidth: 2, paddingVertical: Spacing.three },
  footerRow: { flexDirection: 'row', gap: Spacing.two },
  skip: { width: 110 },
  banner: { paddingVertical: Spacing.three },
  bannerInner: { gap: Spacing.three },
  bannerHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  celebrate: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.four },
  celebrateText: { gap: Spacing.two, alignItems: 'center' },
  celebrateAction: { alignSelf: 'stretch' },
});
