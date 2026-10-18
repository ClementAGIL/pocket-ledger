import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';

import { base64Decode, base64Encode, utf8Decode, utf8Encode } from './encoding';

/*
 * Password-protected backups, in pure JS (works in Expo Go):
 * - key: scrypt(password, random salt) — slow on purpose, to make password guessing expensive;
 * - cipher: XChaCha20-Poly1305 with a random nonce — authenticated, so a wrong password or a
 *   modified file is detected instead of producing garbage.
 * All parameters are stored in the file, so they can be strengthened later without breaking old files.
 * Lose the password and the backup can't be opened: there is no recovery.
 */

/** scrypt "interactive" cost (16 MB). A few seconds on a phone, in pure JS. */
export const DEFAULT_KDF = { N: 2 ** 14, r: 8, p: 1 } as const;
/** Refuse files asking for absurd costs (a crafted file could otherwise freeze the app). */
const MAX_N = 2 ** 20;

export const MIN_PASSWORD_LENGTH = 8;

export interface EncryptedBackupFile {
  app: 'my-finance';
  encrypted: 1;
  kdf: { name: 'scrypt'; N: number; r: number; p: number; salt: string };
  cipher: { name: 'xchacha20-poly1305'; nonce: string };
  data: string;
}

export class WrongPasswordError extends Error {
  constructor() {
    super('Wrong password, or the file was modified.');
  }
}

type Progress = (fraction: number) => void;

function deriveKey(password: string, salt: Uint8Array, kdf: { N: number; r: number; p: number }, onProgress?: Progress) {
  // NFKC: the same password typed on different keyboards gives the same bytes.
  return scryptAsync(utf8Encode(password.normalize('NFKC')), salt, { ...kdf, dkLen: 32, asyncTick: 25, onProgress });
}

export async function encryptBackup(
  plaintext: string,
  password: string,
  randomBytes: (n: number) => Uint8Array,
  options: { kdf?: { N: number; r: number; p: number }; onProgress?: Progress } = {},
): Promise<string> {
  const kdf = options.kdf ?? DEFAULT_KDF;
  const salt = randomBytes(16);
  const nonce = randomBytes(24);
  const key = await deriveKey(password, salt, kdf, options.onProgress);
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(utf8Encode(plaintext));
  const file: EncryptedBackupFile = {
    app: 'my-finance',
    encrypted: 1,
    kdf: { name: 'scrypt', ...kdf, salt: base64Encode(salt) },
    cipher: { name: 'xchacha20-poly1305', nonce: base64Encode(nonce) },
    data: base64Encode(ciphertext),
  };
  return JSON.stringify(file);
}

export function isEncryptedBackup(text: string): boolean {
  try {
    const json = JSON.parse(text);
    return json?.app === 'my-finance' && json?.encrypted === 1;
  } catch {
    return false;
  }
}

export async function decryptBackup(text: string, password: string, onProgress?: Progress): Promise<string> {
  const file = JSON.parse(text) as EncryptedBackupFile;
  const { kdf, cipher } = file;
  const valid =
    kdf?.name === 'scrypt' &&
    cipher?.name === 'xchacha20-poly1305' &&
    Number.isInteger(kdf.N) &&
    kdf.N >= 2 &&
    kdf.N <= MAX_N &&
    (kdf.N & (kdf.N - 1)) === 0 &&
    Number.isInteger(kdf.r) &&
    kdf.r >= 1 &&
    kdf.r <= 32 &&
    Number.isInteger(kdf.p) &&
    kdf.p >= 1 &&
    kdf.p <= 16 &&
    typeof kdf.salt === 'string' &&
    typeof cipher.nonce === 'string' &&
    typeof file.data === 'string';
  if (!valid) throw new Error('Invalid encrypted backup.');

  const key = await deriveKey(password, base64Decode(kdf.salt), kdf, onProgress);
  try {
    return utf8Decode(xchacha20poly1305(key, base64Decode(cipher.nonce)).decrypt(base64Decode(file.data)));
  } catch {
    throw new WrongPasswordError();
  }
}
