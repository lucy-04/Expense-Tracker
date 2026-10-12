import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { EASE_OUT_FN, popIn } from '@/components/motion';
import { ThemedText } from '@/components/themed-text';
import { Busy, Button, EmojiBadge, Field, Screen, SectionTitle, Tile } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { TYPE_EMOJI } from '@/core/categories';
import { formatPaise } from '@/core/money';
import { monthLabel } from '@/core/stats';
import { useQuery } from '@/db/changes';
import { parseStatementCsv, parseStatementPdf } from '@/core/statement';
import type { StatementParse } from '@/core/types';
import { listStatements, saveStatement } from '@/db/repo';
import {
  buildPreview,
  discardPicked,
  readPicked,
  UnsupportedFileError,
  type PickedFile,
  type Preview,
} from '@/features/import/import-statement';
import { TYPE_LABELS, useCategories } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';
import { addPdfPassword, getPdfPasswords } from '@/lib/secrets';
import { usePdfExtractor } from '@/pdf/use-pdf-extractor';

type Step =
  | { kind: 'idle' }
  | { kind: 'working'; label: string }
  | { kind: 'password'; file: Extract<PickedFile, { kind: 'pdf' }>; incorrect: boolean }
  | { kind: 'preview'; preview: Preview }
  | { kind: 'done'; inserted: number; skipped: number; spent: number; month?: string }
  | { kind: 'error'; title: string; message: string; issues?: string[] };

export default function ImportScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { nameOf, emojiOf } = useCategories();
  const extractor = usePdfExtractor();
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const statements = useQuery(() => listStatements(db), [db]).data ?? [];

  async function pick() {
    // Any file type: CSVs carry different MIME types on different phones; readPicked checks.
    // No cache copy: Expo Go may not read the picker's cache folder, but a content:// URI is readable.
    const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: false });
    if (res.canceled) return;
    const asset = res.assets[0];
    setStep({ kind: 'working', label: 'Opening your statement' });
    try {
      const file = readPicked(asset.uri, asset.name, asset.mimeType);
      if (file.kind === 'csv') await review(file, parseStatementCsv(file.text));
      else await openPdf(file);
    } catch (e) {
      const unsupported = e instanceof UnsupportedFileError;
      fail({ title: unsupported ? "That file type isn't supported" : "Couldn't open that file", message: String((e as Error).message ?? e) });
    }
  }

  /** Tries no password, then each saved one (one per bank), before asking. */
  async function openPdf(file: Extract<PickedFile, { kind: 'pdf' }>) {
    setStep({ kind: 'working', label: 'Unlocking and reading' });
    for (const pw of [undefined, ...(await getPdfPasswords())]) {
      const result = await extractor.extract(file.base64, pw);
      if (result.ok) return review(file, parseStatementPdf(result.pages));
      if (!('password' in result)) return failRead(file, result.error);
    }
    setStep({ kind: 'password', file, incorrect: false });
  }

  async function unlockWith(file: Extract<PickedFile, { kind: 'pdf' }>, pw: string) {
    setStep({ kind: 'working', label: 'Unlocking and reading' });
    const result = await extractor.extract(file.base64, pw);
    if (!result.ok && 'password' in result) {
      setStep({ kind: 'password', file, incorrect: true });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (!result.ok) return failRead(file, result.error);
    if (remember) await addPdfPassword(pw);
    await review(file, parseStatementPdf(result.pages));
  }

  function failRead(file: PickedFile, error: string) {
    discardPicked(file);
    fail({ title: "Couldn't read this PDF", message: error });
  }

  async function review(file: PickedFile, parse: StatementParse) {
    setStep({ kind: 'working', label: 'Checking every transaction' });
    const preview = await buildPreview(db, file, parse);
    if (preview.parse.issues.length > 0) {
      discardPicked(file);
      fail({
        title: 'Nothing was imported',
        message: "The numbers in this statement don't add up the way they should, so the app won't guess.",
        issues: preview.parse.issues,
      });
      return;
    }
    setStep({ kind: 'preview', preview });
  }

  function fail(error: Omit<Extract<Step, { kind: 'error' }>, 'kind'>) {
    setStep({ kind: 'error', ...error });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }

  async function commit(preview: Preview) {
    setStep({ kind: 'working', label: 'Saving' });
    const res = await saveStatement(db, {
      fileHash: preview.file.hash,
      fileName: preview.file.name,
      parse: preview.parse,
      txns: preview.txns,
      newIds: preview.newIds,
    });
    discardPicked(preview.file);
    setStep({ kind: 'done', ...res, spent: preview.spent, month: preview.parse.periodFrom?.slice(0, 7) });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function reset() {
    if (step.kind === 'password') discardPicked(step.file);
    if (step.kind === 'preview') discardPicked(step.preview.file);
    setPassword('');
    setStep({ kind: 'idle' });
  }

  return (
    <Screen title={step.kind === 'done' ? undefined : 'Import'}>
      {extractor.element}

      {step.kind === 'idle' && (
        <Tile style={styles.hero}>
          <EmojiBadge emoji="📄" size={88} tint={theme.primarySoft} />
          <ThemedText type="heading" style={styles.center}>
            Add a bank statement
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            The PDF your bank emails you, or a PDF or CSV from your bank&apos;s app. Axis Bank and Bank of Baroda work today; other
            banks often do too. It never leaves this phone.
          </ThemedText>
          <Button title="Choose file" icon="📂" onPress={pick} style={styles.stretch} />
        </Tile>
      )}

      {step.kind === 'working' && <Busy label={step.label} />}

      {step.kind === 'password' && (
        <Tile style={styles.gap}>
          <View style={styles.rowCenter}>
            <EmojiBadge emoji="🔒" size={52} />
            <View style={styles.flex}>
              <ThemedText type="heading">It&apos;s password-protected</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                The bank&apos;s statement email explains the password format.
              </ThemedText>
            </View>
          </View>
          <Field
            value={password}
            onChangeText={setPassword}
            placeholder="PDF password"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => password && unlockWith(step.file, password)}
          />
          {step.incorrect ? (
            <ThemedText type="smallBold" style={{ color: theme.danger }}>
              That password didn&apos;t work. Check the format in the email and try again.
            </ThemedText>
          ) : null}
          <View style={styles.rowCenter}>
            <ThemedText style={styles.flex}>Remember it on this phone</ThemedText>
            <Switch value={remember} onValueChange={setRemember} trackColor={{ true: theme.primary }} />
          </View>
          <Button title="Unlock" disabled={!password} onPress={() => unlockWith(step.file, password)} />
          <Button title="Cancel" variant="secondary" onPress={reset} />
        </Tile>
      )}

      {step.kind === 'preview' && (
        <PreviewView preview={step.preview} nameOf={nameOf} emojiOf={emojiOf} onCommit={commit} onCancel={reset} />
      )}

      {step.kind === 'done' && <Done step={step} onAnother={reset} />}

      {step.kind === 'error' && (
        <Tile style={styles.gap}>
          <View style={styles.rowCenter}>
            <EmojiBadge emoji="⚠️" size={52} tint={theme.dangerSoft} />
            <ThemedText type="heading" style={styles.flex}>
              {step.title}
            </ThemedText>
          </View>
          <ThemedText themeColor="textSecondary">{step.message}</ThemedText>
          {step.issues?.map((issue) => (
            <ThemedText key={issue} type="small" themeColor="textSecondary">
              {issue}
            </ThemedText>
          ))}
          <Button title="Try another file" onPress={reset} />
        </Tile>
      )}

      {statements.length > 0 && step.kind !== 'done' ? (
        <>
          <SectionTitle>Already imported</SectionTitle>
          <Tile style={styles.gap}>
            {statements.map((s) => (
              <View key={s.id} style={styles.rowCenter}>
                <EmojiBadge emoji="🗓️" size={40} />
                <View style={styles.flex}>
                  <ThemedText type="smallBold">{s.period_from ? monthLabel(s.period_from.slice(0, 7)) : s.file_name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" tabular>
                    {s.account_name ? `${s.account_name}: ` : ''}
                    {s.txn_count} payments, {s.new_count} new
                  </ThemedText>
                </View>
              </View>
            ))}
          </Tile>
        </>
      ) : null}
    </Screen>
  );
}

function PreviewView({
  preview,
  nameOf,
  emojiOf,
  onCommit,
  onCancel,
}: {
  preview: Preview;
  nameOf: (id: string | null) => string;
  emojiOf: (id: string | null) => string;
  onCommit: (p: Preview) => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const { parse, txns, newIds } = preview;
  const newCount = newIds.size;
  return (
    <>
      <Tile style={styles.gap}>
        <ThemedText type="heading">{parse.periodFrom ? monthLabel(parse.periodFrom.slice(0, 7)) : 'Your statement'}</ThemedText>
        <ThemedText type="smallBold" themeColor="textSecondary">
          🏦 {preview.accountLabel}
          {preview.isNewAccount ? ' (new account)' : ''}
        </ThemedText>
        <Check text="Every balance adds up" />
        {parse.totals ? <Check text="Totals match the statement" /> : null}
        <View style={styles.statRow}>
          <Stat label="Spent" value={formatPaise(preview.spent, { decimals: false })} />
          <Stat label="Income" value={formatPaise(preview.income, { decimals: false })} />
          <Stat label="New" value={String(newCount)} />
        </View>
        {preview.previousImport ? (
          <ThemedText type="small" themeColor="textSecondary">
            You&apos;ve imported this file before. Payments already in the app are skipped.
          </ThemedText>
        ) : txns.length > newCount ? (
          <ThemedText type="small" themeColor="textSecondary" tabular>
            {txns.length - newCount} of these are already in the app (perhaps from another download of this statement) and
            will be skipped.
          </ThemedText>
        ) : null}
        <Button
          title={newCount === 0 ? 'Nothing new to import' : `Import ${newCount} payment${newCount === 1 ? '' : 's'}`}
          disabled={newCount === 0}
          onPress={() => onCommit(preview)}
        />
        <Button title="Cancel" variant="secondary" onPress={onCancel} />
      </Tile>

      <SectionTitle>First few</SectionTitle>
      <Tile style={styles.gap}>
        {txns.slice(0, 8).map((t) => (
          <View key={t.id} style={styles.rowCenter}>
            <EmojiBadge emoji={t.type === 'expense' ? emojiOf(t.categoryId) : TYPE_EMOJI[t.type]} size={40} />
            <View style={styles.flex}>
              <ThemedText type="smallBold" numberOfLines={1}>
                {t.parsed.counterparty}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t.type === 'expense' ? nameOf(t.categoryId) : TYPE_LABELS[t.type]}
              </ThemedText>
            </View>
            <ThemedText type="smallBold" tabular style={t.direction === 'credit' ? { color: theme.positive } : undefined}>
              {t.direction === 'credit' ? '+' : '−'}
              {formatPaise(t.amount)}
            </ThemedText>
          </View>
        ))}
        {txns.length > 8 ? (
          <ThemedText type="small" themeColor="textSecondary">
            and {txns.length - 8} more
          </ThemedText>
        ) : null}
      </Tile>
    </>
  );
}

function Done({ step, onAnother }: { step: Extract<Step, { kind: 'done' }>; onAnother: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.done}>
      <Animated.View entering={popIn}>
        <EmojiBadge emoji={step.inserted > 0 ? '🎉' : '👌'} size={120} tint={theme.primarySoft} />
      </Animated.View>
      <Animated.View entering={FadeIn.delay(180).duration(280).easing(EASE_OUT_FN)} style={styles.doneText}>
        <ThemedText type="title" style={styles.center}>
          {step.inserted > 0 ? 'Statement added!' : 'Already up to date'}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {step.inserted > 0
            ? `${step.inserted} new payment${step.inserted === 1 ? '' : 's'}${step.month ? ` from ${monthLabel(step.month)}` : ''}.`
            : 'Every payment in this file was already in the app.'}
          {step.skipped > 0 && step.inserted > 0 ? ` ${step.skipped} were already here.` : ''}
        </ThemedText>
      </Animated.View>
      {step.inserted > 0 ? (
        <Animated.View entering={FadeIn.delay(320).duration(280).easing(EASE_OUT_FN)} style={styles.doneStats}>
          <Stat label="Spent that month" value={formatPaise(step.spent, { decimals: false })} />
        </Animated.View>
      ) : null}
      <View style={styles.stretch}>
        <Button title="See my month" onPress={() => router.navigate('/')} />
        <View style={styles.spacer} />
        <Button title="Import another" variant="secondary" onPress={onAnother} />
      </View>
    </View>
  );
}

function Check({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.rowCenter}>
      <View style={[styles.checkDot, { backgroundColor: theme.success }]}>
        <ThemedText type="smallBold" style={styles.checkMark}>
          ✓
        </ThemedText>
      </View>
      <ThemedText type="smallBold" style={{ color: theme.successText }}>
        {text}
      </ThemedText>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: theme.badge }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="heading" tabular>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  stretch: { alignSelf: 'stretch' },
  gap: { gap: Spacing.three },
  spacer: { height: Spacing.two },
  hero: { alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.five, paddingHorizontal: Spacing.four },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  statRow: { flexDirection: 'row', gap: Spacing.two },
  stat: { flex: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  checkDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  checkMark: { color: '#FFFFFF' },
  done: { alignItems: 'center', gap: Spacing.four, paddingTop: Spacing.six },
  doneText: { gap: Spacing.two, alignItems: 'center' },
  doneStats: { flexDirection: 'row', alignSelf: 'stretch' },
});
