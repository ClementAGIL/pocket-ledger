import { Alert } from 'react-native';

import { errorMessage, isDuplicateName } from '@/db/errors';

/**
 * "Could not save" alert after a failed `write()`. A name already used gets `duplicate`;
 * anything else shows the real error, never a guess.
 */
export function showSaveError(e: unknown, duplicate = 'This name is already used.') {
  Alert.alert('Could not save', isDuplicateName(e) ? duplicate : errorMessage(e));
}
