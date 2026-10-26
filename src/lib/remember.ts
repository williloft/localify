/**
 * The only thing Localify ever writes to the device, and only when the visitor
 * asks for it: the chosen file name pattern, under one localStorage key.
 * The privacy text in src/Privacy.tsx is built from STORED, so the two cannot drift apart.
 */
import type { NamePattern } from './filename';

export const PATTERN_KEY = 'localify:name-pattern';

/** Everything the app may keep in browser storage. Add a key here and the privacy text follows. */
export const STORED: { key: string; what: string }[] = [
  { key: PATTERN_KEY, what: 'det filnavnemønster, du har valgt' },
];

/** The remembered pattern, or null when nothing is remembered. Reading throws in some privacy contexts. */
export function rememberedPattern(): NamePattern | null {
  try {
    return (localStorage.getItem(PATTERN_KEY) as NamePattern | null) || null;
  } catch {
    return null;
  }
}

/** Remember the pattern on this device, or forget it again. Never fatal. */
export function writePattern(pattern: NamePattern | null): void {
  try {
    if (pattern) localStorage.setItem(PATTERN_KEY, pattern);
    else localStorage.removeItem(PATTERN_KEY);
  } catch { /* storage blocked: the pattern still holds for this visit */ }
}
