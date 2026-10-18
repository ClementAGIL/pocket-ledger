import { router } from 'expo-router';

import { OperationForm } from '@/components/operation/OperationForm';

export default function AddScreen() {
  return (
    <OperationForm
      onSaved={(assetId) => router.push({ pathname: '/asset/[id]', params: { id: String(assetId) } })}
    />
  );
}
