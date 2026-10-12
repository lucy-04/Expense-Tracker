import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Switch, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Chip, EmojiBadge, Field, LinkButton, Screen, SectionTitle, Tile } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { TYPE_EMOJI } from '@/core/categories';
import { useQuery } from '@/db/changes';
import {
  addCategory,
  deleteCategory,
  deletePayeeRule,
  getMyNames,
  listPayeeRules,
  renameCategory,
  setMyNames,
  wipeAll,
} from '@/db/repo';
import { exportBackup, pickBackupFile, restoreBackup } from '@/features/backup/backup';
import { TYPE_LABELS, useCategories } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';
import { forgetPdfPasswords, getLockEnabled, getPdfPasswords, setLockEnabled } from '@/lib/secrets';

export default function SettingsScreen() {
  return (
    <Screen title="Settings">
      <MyNames />
      <Categories />
      <PayeeRules />
      <Security />
      <Backup />
      <DangerZone />
    </Screen>
  );
}

function MyNames() {
  const db = useSQLiteContext();
  const names = useQuery(() => getMyNames(db), [db]).data ?? [];
  const [draft, setDraft] = useState('');
  const add = async () => {
    if (!draft.trim()) return;
    await setMyNames(db, [...names, draft]);
    setDraft('');
  };
  return (
    <>
      <SectionTitle>Your names</SectionTitle>
      <Tile style={styles.tile}>
        <Intro emoji="🙋">
          Money to or from these is a move between your own accounts, not spending. Add your name the way banks print it (like
          “ROHAN M” for Rohan Mehta) and your UPI IDs (like rohan@okaxis), since some banks show only the UPI ID.
        </Intro>
        <View style={styles.wrap}>
          {names.map((n) => (
            <Chip key={n} label={`${n}  ✕`} selected onPress={() => setMyNames(db, names.filter((x) => x !== n))} />
          ))}
        </View>
        <View style={styles.row}>
          <Field
            style={styles.flex}
            value={draft}
            onChangeText={setDraft}
            placeholder="Add a name or UPI ID"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={add}
          />
          <Button title="Add" onPress={add} disabled={!draft.trim()} />
        </View>
      </Tile>
    </>
  );
}

function Categories() {
  const db = useSQLiteContext();
  const { list } = useCategories();
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [emoji, setEmoji] = useState('');
  const [draft, setDraft] = useState('');

  const saveRename = async (id: string) => {
    await renameCategory(db, id, text, emoji.trim() || undefined);
    setEditing(null);
  };
  const addNew = async () => {
    if (!draft.trim()) return;
    await addCategory(db, draft);
    setDraft('');
  };

  const confirmDelete = (id: string, name: string) =>
    Alert.alert(`Delete “${name}”?`, 'Its transactions become Uncategorized.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteCategory(db, id) },
    ]);

  return (
    <>
      <SectionTitle>Categories</SectionTitle>
      <Tile style={styles.tile}>
        {list.map((c) =>
          editing === c.id ? (
            <View key={c.id} style={styles.row}>
              <Field
                style={styles.emojiField}
                value={emoji}
                onChangeText={setEmoji}
                accessibilityLabel="Icon"
                maxLength={8}
                returnKeyType="next"
              />
              <Field
                style={styles.flex}
                value={text}
                onChangeText={setText}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => text.trim() && saveRename(c.id)}
              />
              <Button title="Save" disabled={!text.trim()} onPress={() => saveRename(c.id)} />
            </View>
          ) : (
            <View key={c.id} style={styles.row}>
              <EmojiBadge emoji={c.emoji} size={40} />
              <ThemedText type="smallBold" style={styles.flex}>
                {c.name}
              </ThemedText>
              <LinkButton
                label="Edit"
                onPress={() => {
                  setEditing(c.id);
                  setText(c.name);
                  setEmoji(c.emoji);
                }}
              />
              <LinkButton label="Delete" danger onPress={() => confirmDelete(c.id, c.name)} />
            </View>
          ),
        )}
        <View style={styles.row}>
          <Field
            style={styles.flex}
            value={draft}
            onChangeText={setDraft}
            placeholder="New category"
            returnKeyType="done"
            onSubmitEditing={addNew}
          />
          <Button title="Add" disabled={!draft.trim()} onPress={addNew} />
        </View>
      </Tile>
    </>
  );
}

function PayeeRules() {
  const db = useSQLiteContext();
  const { nameOf, emojiOf } = useCategories();
  const rules = useQuery(() => listPayeeRules(db), [db]).data ?? [];
  if (rules.length === 0) return null;
  return (
    <>
      <SectionTitle>Remembered payees</SectionTitle>
      <Tile style={styles.tile}>
        <Intro emoji="🧠">New payments to these payees are sorted automatically. Forget one to sort it again.</Intro>
        {rules.map((r) => (
          <View key={r.payee_key} style={styles.row}>
            <EmojiBadge emoji={r.type && r.type !== 'expense' ? TYPE_EMOJI[r.type] : emojiOf(r.category_id)} size={40} />
            <View style={styles.flex}>
              <ThemedText type="smallBold" numberOfLines={1}>
                {r.display_name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {r.type && r.type !== 'expense' ? TYPE_LABELS[r.type] : nameOf(r.category_id)}
              </ThemedText>
            </View>
            <LinkButton label="Forget" onPress={() => deletePayeeRule(db, r.payee_key)} />
          </View>
        ))}
      </Tile>
    </>
  );
}

function Security() {
  const [lock, setLock] = useState<boolean | null>(null);
  const [pwCount, setPwCount] = useState(0);
  useEffect(() => {
    getLockEnabled().then(setLock);
    getPdfPasswords().then((list) => setPwCount(list.length));
  }, []);
  return (
    <>
      <SectionTitle>Security</SectionTitle>
      <Tile style={styles.tile}>
        <View style={styles.row}>
          <EmojiBadge emoji="🔐" size={44} />
          <View style={styles.flex}>
            <ThemedText type="smallBold">Fingerprint or PIN lock</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Asks when the app opens, and again after a minute away.
            </ThemedText>
          </View>
          <Toggle
            value={!!lock}
            disabled={lock === null}
            onValueChange={async (on) => {
              await setLockEnabled(on);
              setLock(on);
            }}
          />
        </View>
        {pwCount > 0 ? (
          <View style={styles.row}>
            <EmojiBadge emoji="🔑" size={44} />
            <ThemedText type="smallBold" style={styles.flex}>
              {pwCount === 1 ? 'Saved statement password' : `${pwCount} saved statement passwords`}
            </ThemedText>
            <LinkButton
              label="Forget"
              onPress={async () => {
                await forgetPdfPasswords();
                setPwCount(0);
              }}
            />
          </View>
        ) : null}
      </Tile>
    </>
  );
}

function Backup() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [mode, setMode] = useState<'idle' | 'export' | 'restore'>('idle');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [restoreUri, setRestoreUri] = useState<string | null>(null);
  const repeatRef = useRef<TextInput>(null);
  const canExport = pw.length >= 8 && pw === pw2;

  const reset = () => {
    setMode('idle');
    setPw('');
    setPw2('');
    setRestoreUri(null);
  };

  async function doExport() {
    setBusy(true);
    setMessage(null);
    try {
      await exportBackup(db, pw);
      setMessage({ text: 'Backup saved. Keep the password safe: without it, nobody can open the file, including you.' });
      reset();
    } catch (e) {
      setMessage({ text: String((e as Error).message ?? e), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function chooseRestore() {
    const uri = await pickBackupFile();
    if (!uri) return;
    setRestoreUri(uri);
    setMode('restore');
    setMessage(null);
  }

  function doRestore() {
    Alert.alert('Replace all data?', 'Everything currently in the app is replaced by the backup.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Replace',
        style: 'destructive',
        onPress: async () => {
          if (!restoreUri) return;
          setBusy(true);
          try {
            const res = await restoreBackup(db, restoreUri, pw);
            setMessage({ text: `Restored ${res.transactions} transactions.` });
            reset();
          } catch (e) {
            setMessage({ text: String((e as Error).message ?? e), error: true });
            reset();
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  return (
    <>
      <SectionTitle>Backup</SectionTitle>
      <Tile style={styles.tile}>
        <Intro emoji="💾">
          Everything lives only on this phone. Save an encrypted backup wherever you like; nothing is uploaded on its own.
        </Intro>
        {mode === 'idle' ? (
          <>
            <Button title="Back up now" onPress={() => setMode('export')} />
            <Button title="Restore from backup" variant="secondary" onPress={chooseRestore} />
          </>
        ) : null}
        {mode === 'export' ? (
          <>
            <Field
              value={pw}
              onChangeText={setPw}
              placeholder="Backup password (min 8 chars)"
              secureTextEntry
              autoCapitalize="none"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => repeatRef.current?.focus()}
            />
            <Field
              ref={repeatRef}
              value={pw2}
              onChangeText={setPw2}
              placeholder="Repeat password"
              secureTextEntry
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={() => canExport && doExport()}
            />
            {pw2.length > 0 && pw !== pw2 ? (
              <ThemedText type="smallBold" style={{ color: theme.danger }}>
                Passwords don&apos;t match.
              </ThemedText>
            ) : null}
            <Button title="Create backup" loading={busy} disabled={!canExport} onPress={doExport} />
            <Button title="Cancel" variant="secondary" onPress={reset} />
          </>
        ) : null}
        {mode === 'restore' ? (
          <>
            <Field
              value={pw}
              onChangeText={setPw}
              placeholder="Backup password"
              secureTextEntry
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={() => pw && doRestore()}
            />
            <Button title="Restore" loading={busy} disabled={!pw} onPress={doRestore} />
            <Button title="Cancel" variant="secondary" onPress={reset} />
          </>
        ) : null}
        {message ? (
          <ThemedText type="smallBold" style={{ color: message.error ? theme.danger : theme.successText }}>
            {message.text}
          </ThemedText>
        ) : null}
      </Tile>
    </>
  );
}

function DangerZone() {
  const db = useSQLiteContext();
  return (
    <>
      <SectionTitle>Start over</SectionTitle>
      <Tile style={styles.tile}>
        <Intro emoji="🗑️">Removes every imported statement, payment and remembered payee from this phone.</Intro>
        <Button
          title="Delete everything"
          variant="danger"
          onPress={() =>
            Alert.alert('Delete everything?', 'All imported statements, transactions and remembered payees are removed.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => wipeAll(db) },
            ])
          }
        />
      </Tile>
    </>
  );
}

/** The first row of each settings tile: an icon and one line on what the section does. */
function Intro({ emoji, children }: { emoji: string; children: string }) {
  return (
    <View style={styles.intro}>
      <EmojiBadge emoji={emoji} size={44} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
        {children}
      </ThemedText>
    </View>
  );
}

function Toggle({ value, disabled, onValueChange }: { value: boolean; disabled?: boolean; onValueChange: (v: boolean) => void }) {
  const theme = useTheme();
  return (
    <Switch
      value={value}
      disabled={disabled}
      onValueChange={onValueChange}
      trackColor={{ true: theme.primary, false: theme.track }}
      thumbColor="#FFFFFF"
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tile: { gap: Spacing.three },
  intro: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 48 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  emojiField: { width: 64 },
});
