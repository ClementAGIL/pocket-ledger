import Storage from 'expo-sqlite/kv-store';

/*
 * The introduction is shown once per install, on the first start (Settings › Help shows it again).
 * Stored outside both databases, like the data mode: a reset or the demo doesn't bring it back.
 */
const SEEN_KEY = 'onboardingSeen';

export function onboardingSeen(): boolean {
  try {
    return Storage.getItemSync(SEEN_KEY) !== null;
  } catch {
    return true;
  }
}

export function markOnboardingSeen() {
  try {
    Storage.setItemSync(SEEN_KEY, '1');
  } catch {
    // Best effort: at worst it's shown once more.
  }
}
