import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Input, Money } from '@/components/ui';
import { showSaveError } from '@/components/saveError';
import * as repo from '@/db/repo';
import type { Account } from '@/domain/types';
import { useData } from '@/state/DataProvider';
import { space, useTheme } from '@/theme';

export default function AccountsScreen() {
  const theme = useTheme();
  const { snapshot, portfolio, write } = useData();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newName, setNewName] = useState('');

  const valueOf = (accountId: number) =>
    [...portfolio.byAssetId.values()]
      .filter((v) => v.account.id === accountId)
      .reduce((sum, v) => sum + (v.isLiability ? -v.position.value : v.position.value), 0);

  const add = async () => {
    if (!newName.trim()) return;
    try {
      await write((txn) => repo.insertAccount(txn, { name: newName }));
      setNewName('');
    } catch (e) {
      showSaveError(e, 'An account with this name already exists.');
    }
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <Card style={{ paddingVertical: 0 }}>
        {snapshot.accounts.length === 0 && (
          <Text style={{ color: theme.textMuted, paddingVertical: space.lg }}>No accounts yet.</Text>
        )}
        {snapshot.accounts.map((a) =>
          editingId === a.id ? (
            <AccountEditor key={a.id} account={a} onDone={() => setEditingId(null)} />
          ) : (
            <Pressable
              key={a.id}
              onPress={() => setEditingId(a.id)}
              accessibilityRole="button"
              style={[styles.row, { borderColor: theme.border, opacity: a.archived ? 0.5 : 1 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 16 }}>{a.name}</Text>
                {(a.institution || a.archived) && (
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                    {[a.institution, a.archived && 'Archived'].filter(Boolean).join(' · ')}
                  </Text>
                )}
              </View>
              <Money value={valueOf(a.id)} rounded />
            </Pressable>
          ),
        )}
      </Card>

      <View style={styles.addRow}>
        <Input value={newName} onChangeText={setNewName} placeholder="New account name" style={{ flex: 1 }} />
        <Button title="Add" onPress={add} disabled={!newName.trim()} />
      </View>
    </ScrollView>
  );
}

function AccountEditor({ account, onDone }: { account: Account; onDone: () => void }) {
  const theme = useTheme();
  const { write } = useData();
  const [name, setName] = useState(account.name);
  const [institution, setInstitution] = useState(account.institution ?? '');

  const save = async (archived = account.archived) => {
    if (!name.trim()) return;
    try {
      await write((txn) => repo.updateAccount(txn, account.id, { name, institution: institution || null, archived }));
      onDone();
    } catch (e) {
      showSaveError(e, 'An account with this name already exists.');
    }
  };

  return (
    <View style={[styles.editor, { borderColor: theme.border }]}>
      <Input value={name} onChangeText={setName} placeholder="Name" />
      <Input value={institution} onChangeText={setInstitution} placeholder="Institution (optional)" />
      <View style={styles.editorButtons}>
        <Button title="Save" onPress={() => save()} style={{ flex: 1 }} />
        <Button
          title={account.archived ? 'Unarchive' : 'Archive'}
          variant="secondary"
          onPress={() => save(!account.archived)}
          style={{ flex: 1 }}
        />
        <Button title="Cancel" variant="secondary" onPress={onDone} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xl * 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  editor: { gap: space.sm, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  editorButtons: { flexDirection: 'row', gap: space.sm },
  addRow: { flexDirection: 'row', gap: space.sm, marginTop: space.lg, alignItems: 'center' },
});
