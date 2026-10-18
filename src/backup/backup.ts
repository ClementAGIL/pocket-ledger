import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { loadSnapshot, replaceAll } from '@/db/repo';
import { today } from '@/domain/dates';
import type { Snapshot } from '@/domain/types';

import { decryptBackup, encryptBackup, isEncryptedBackup } from './encryption';
import { parseBackup, serializeBackup } from './format';

type Progress = (fraction: number) => void;

/**
 * Writes the backup to the app cache and opens the share sheet, so the user decides where it goes
 * (Files, a USB drive, a cloud drive…). With a password, the file is encrypted. The temp file is
 * deleted afterwards.
 */
export async function exportBackup(db: SQLiteDatabase, password: string | null, onProgress?: Progress) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  const plain = serializeBackup(await loadSnapshot(db));
  const content = password ? await encryptBackup(plain, password, Crypto.getRandomBytes, { onProgress }) : plain;
  const file = new File(Paths.cache, `pocket-ledger-backup-${today()}${password ? '.encrypted' : ''}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: 'Save Pocket Ledger backup',
    });
  } finally {
    if (file.exists) file.delete();
  }
}

export type PickedBackup = { kind: 'plain'; data: Snapshot } | { kind: 'encrypted'; text: string };

/** Lets the user pick a backup file. Plain files are validated; encrypted ones need `unlockBackup`. */
export async function pickBackup(): Promise<PickedBackup | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const file = new File(result.assets[0].uri);
  try {
    const text = await file.text();
    return isEncryptedBackup(text) ? { kind: 'encrypted', text } : { kind: 'plain', data: parseBackup(text) };
  } finally {
    if (file.exists) file.delete();
  }
}

/** Decrypts and validates an encrypted backup. Throws WrongPasswordError on a wrong password. */
export async function unlockBackup(text: string, password: string, onProgress?: Progress): Promise<Snapshot> {
  return parseBackup(await decryptBackup(text, password, onProgress));
}

export async function restoreBackup(db: SQLiteDatabase, data: Snapshot) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await replaceAll(txn, data);
  });
}
