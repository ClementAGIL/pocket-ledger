import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Select } from '@/components/Select';
import { Button, Field, Input } from '@/components/ui';
import * as repo from '@/db/repo';
import { useData } from '@/state/DataProvider';
import { space } from '@/theme';

/** Investment page in edit mode: name, identifier, category, account; archive or delete. */
export function EditAsset({ assetId, onDone, onDelete }: { assetId: number; onDone: () => void; onDelete: () => void }) {
  const { snapshot, write } = useData();
  const asset = snapshot.assets.find((a) => a.id === assetId)!;
  const [name, setName] = useState(asset.name);
  const [identifier, setIdentifier] = useState(asset.identifier ?? '');
  const [accountId, setAccountId] = useState(asset.accountId);
  const [categoryId, setCategoryId] = useState(asset.categoryId);

  // Valuation is fixed at creation: only categories with the same valuation are offered.
  const categories = snapshot.categories.filter((c) => c.valuation === asset.valuation);

  const save = async (archived = asset.archived) => {
    if (!name.trim()) return Alert.alert('Name is required');
    await write((txn) =>
      repo.updateAsset(txn, asset.id, {
        accountId,
        categoryId,
        name,
        identifier: identifier || null,
        // Notes are edited in their own section: keep them as they are.
        note: asset.note,
        reviewDate: asset.reviewDate,
        archived,
      }),
    );
    onDone();
  };

  return (
    <View>
      <Field label="Name">
        <Input value={name} onChangeText={setName} />
      </Field>
      <Field label="Identifier">
        <Input value={identifier} onChangeText={setIdentifier} autoCapitalize="characters" />
      </Field>
      <Field label="Category">
        <Select
          title="Category"
          placeholder="Category"
          options={categories.map((c) => ({ value: c.id, label: c.name, color: c.color }))}
          value={categoryId}
          onChange={setCategoryId}
        />
      </Field>
      <Field label="Account">
        <Select
          title="Account"
          placeholder="Account"
          options={snapshot.accounts.map((a) => ({ value: a.id, label: a.name }))}
          value={accountId}
          onChange={setAccountId}
        />
      </Field>
      <Button title="Save" onPress={() => save()} style={{ marginTop: space.xl }} />
      <Button
        title={asset.archived ? 'Unarchive' : 'Archive (hide from lists)'}
        variant="secondary"
        onPress={() => save(!asset.archived)}
        style={{ marginTop: space.md }}
      />
      <Button title="Delete investment" variant="danger" onPress={onDelete} style={{ marginTop: space.md }} />
    </View>
  );
}
