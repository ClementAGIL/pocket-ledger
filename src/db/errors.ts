/** Readable text of anything thrown (SQLite errors, I/O…). */
export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/**
 * A UNIQUE constraint failed: an account or category name already used (names are unique,
 * ignoring case). Matches SQLite's own text, the same through expo-sqlite and node:sqlite.
 */
export function isDuplicateName(e: unknown) {
  return /UNIQUE constraint failed: (accounts|categories)\.name/i.test(errorMessage(e));
}
