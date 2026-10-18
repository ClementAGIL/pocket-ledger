import { base64Decode, base64Encode, utf8Decode, utf8Encode } from '../encoding';
import { decryptBackup, encryptBackup, isEncryptedBackup, WrongPasswordError } from '../encryption';

// Small cost so tests stay fast; the app uses DEFAULT_KDF.
const FAST = { kdf: { N: 2 ** 10, r: 8, p: 1 } };
// Deterministic generator: tests only need different bytes each call (the app uses expo-crypto).
let seed = 42;
const random = (n: number) =>
  Uint8Array.from({ length: n }, () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 16);

describe('encoding', () => {
  it('round-trips UTF-8, including accents, € and emoji', () => {
    const text = 'Livret A — 1 234,56 € · Épargne 🚩 日本';
    expect(utf8Decode(utf8Encode(text))).toBe(text);
    expect(Array.from(utf8Encode('€'))).toEqual([0xe2, 0x82, 0xac]);
  });

  it('matches the RFC 4648 Base64 test vectors and round-trips', () => {
    const vectors: [string, string][] = [
      ['', ''],
      ['f', 'Zg=='],
      ['fo', 'Zm8='],
      ['foo', 'Zm9v'],
      ['foob', 'Zm9vYg=='],
      ['fooba', 'Zm9vYmE='],
      ['foobar', 'Zm9vYmFy'],
    ];
    for (const [plain, encoded] of vectors) {
      expect(base64Encode(utf8Encode(plain))).toBe(encoded);
      expect(utf8Decode(base64Decode(encoded))).toBe(plain);
    }
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(base64Decode(base64Encode(bytes))).toEqual(bytes);
  });
});

describe('encrypted backups', () => {
  const backup = JSON.stringify({ app: 'my-finance', formatVersion: 2, data: { note: 'Épargne 2026 €' } });

  it('round-trips with the right password and hides the content', async () => {
    const encrypted = await encryptBackup(backup, 'correct horse battery', random, FAST);
    expect(isEncryptedBackup(encrypted)).toBe(true);
    expect(isEncryptedBackup(backup)).toBe(false);
    expect(encrypted).not.toContain('Épargne');
    expect(await decryptBackup(encrypted, 'correct horse battery')).toBe(backup);
  });

  it('rejects a wrong password and a tampered file', async () => {
    const encrypted = await encryptBackup(backup, 'correct horse battery', random, FAST);
    await expect(decryptBackup(encrypted, 'wrong password')).rejects.toBeInstanceOf(WrongPasswordError);

    const file = JSON.parse(encrypted);
    const bytes = base64Decode(file.data);
    bytes[5] ^= 1;
    file.data = base64Encode(bytes);
    await expect(decryptBackup(JSON.stringify(file), 'correct horse battery')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('uses a fresh salt and nonce each time', async () => {
    const a = JSON.parse(await encryptBackup(backup, 'pw-12345678', random, FAST));
    const b = JSON.parse(await encryptBackup(backup, 'pw-12345678', random, FAST));
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.nonce).not.toBe(b.cipher.nonce);
  });

  it('refuses files with absurd parameters', async () => {
    const file = JSON.parse(await encryptBackup(backup, 'pw-12345678', random, FAST));
    file.kdf.N = 2 ** 30;
    await expect(decryptBackup(JSON.stringify(file), 'pw-12345678')).rejects.toThrow('Invalid encrypted backup');
  });
});
