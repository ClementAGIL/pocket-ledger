import { router, useNavigation } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

/**
 * Asks before leaving the screen (back button, swipe, header) while `dirty`.
 * Call `leave()` to close the screen without asking, e.g. after saving.
 */
export function useConfirmLeave(dirty: boolean, message: { title: string; text: string; keep: string }) {
  const navigation = useNavigation();
  const leaving = useRef(false);
  const { title, text, keep } = message;

  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (!dirty || leaving.current) return;
      e.preventDefault();
      Alert.alert(title, text, [
        { text: keep, style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
  }, [navigation, dirty, title, text, keep]);

  return {
    leave: () => {
      leaving.current = true;
      router.back();
    },
  };
}
