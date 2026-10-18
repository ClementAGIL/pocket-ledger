import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { MIN_PASSWORD_LENGTH } from '@/backup/encryption';
import { space, useTheme } from '@/theme';

import { Button, Field, Input, ModalCard, ProgressBar } from './ui';

type Progress = (fraction: number) => void;

/**
 * Asks for the backup password and runs the (slow, on purpose) encryption step with a progress bar.
 * - mode "export": password + confirmation, or export without password;
 * - mode "import": the password of an encrypted file.
 * `onSubmit` throws to show an error (e.g. wrong password) and keep the modal open.
 */
export function PasswordModal({
  visible,
  mode,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  mode: 'export' | 'import';
  onSubmit: (password: string | null, onProgress: Progress) => Promise<void>;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const busy = progress !== null;

  const close = () => {
    if (busy) return;
    setPassword('');
    setConfirm('');
    setError(null);
    onClose();
  };

  const run = async (value: string | null) => {
    setError(null);
    if (value !== null) {
      if (value.length < MIN_PASSWORD_LENGTH) return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      if (mode === 'export' && value !== confirm) return setError('The two passwords are different.');
    }
    setProgress(0);
    try {
      await onSubmit(value, (f) => setProgress(f));
      setProgress(null);
      setPassword('');
      setConfirm('');
      onClose();
    } catch (e) {
      setProgress(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <ModalCard visible={visible} onClose={close} style={{ gap: space.sm }}>
      <Text style={[styles.title, { color: theme.text }]}>
        {mode === 'export' ? 'Protect the backup with a password' : 'This backup is encrypted'}
      </Text>
      <Text style={{ color: theme.textSecondary, lineHeight: 20 }}>
        {mode === 'export'
          ? 'Without the password, nobody can read the file. If you forget it, the backup cannot be recovered.'
          : 'Enter the password chosen when the backup was exported.'}
      </Text>

      <Field label="Password" error={error}>
        <Input
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          autoFocus
          placeholder={mode === 'export' ? `At least ${MIN_PASSWORD_LENGTH} characters, a sentence is best` : ''}
        />
      </Field>
      {mode === 'export' && (
        <Field label="Confirm password">
          <Input
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
        </Field>
      )}

      {busy ? (
        <View style={styles.progress}>
          <ActivityIndicator color={theme.primary} />
          <Text style={{ color: theme.textSecondary }}>
            {mode === 'export' ? 'Encrypting' : 'Decrypting'}… {Math.round((progress ?? 0) * 100)}%
          </Text>
          <ProgressBar progress={progress ?? 0} height={6} style={{ alignSelf: 'stretch' }} />
        </View>
      ) : (
        <View style={{ gap: space.sm, marginTop: space.lg }}>
          <Button title={mode === 'export' ? 'Export encrypted' : 'Open backup'} onPress={() => run(password)} />
          {mode === 'export' && (
            <Pressable onPress={() => run(null)} accessibilityRole="button" style={styles.link}>
              <Text style={{ color: theme.textSecondary }}>Export without password</Text>
            </Pressable>
          )}
          <Button title="Cancel" variant="secondary" onPress={close} />
        </View>
      )}
    </ModalCard>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '700' },
  progress: { alignItems: 'center', gap: space.sm, marginTop: space.lg },
  link: { alignItems: 'center', paddingVertical: space.sm },
});
