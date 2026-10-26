/**
 * What an export will change, worked out without writing anything.
 *
 * "Before" is always what the original file holds, never an earlier edit, so
 * typing a value back to the original makes the change disappear. Only the six
 * fields the editor shows, the cover, the format and the file name are
 * compared; fields the editor does not show are covered by the existing
 * "bevares"/"går tabt" notices, not claimed as changed here.
 */

import type { AudioFormat, CoverArt, EditableTags, FileTags } from './tags';
import { mapM4aToId3 } from './tags';
import { buildFilename, type NamePattern } from './filename';

export const FIELD_ORDER: { key: keyof EditableTags; label: string }[] = [
  { key: 'title', label: 'Titel' },
  { key: 'artist', label: 'Kunstner' },
  { key: 'albumArtist', label: 'Albumkunstner' },
  { key: 'album', label: 'Album' },
  { key: 'year', label: 'År' },
  { key: 'track', label: 'Spornummer' },
];

export interface FieldChange {
  key: keyof EditableTags;
  label: string;
  before: string;
  after: string;
}

export type CoverChange = 'added' | 'replaced' | 'removed';

export interface FileChanges {
  fields: FieldChange[];
  cover: CoverChange | null;
  format: { from: AudioFormat; to: AudioFormat } | null;
  name: { from: string; to: string };
  /** Fields that will not survive the save, known before it happens. */
  lost: string[];
}

/** What a loaded file needs for this. LoadedFile fits. */
export interface ChangeInput {
  file: { name: string };
  read: FileTags;
  editable: EditableTags;
  cover: CoverArt | null;
  outputFormat: AudioFormat;
}

/** Same picture, compared by its bytes: a re-picked identical image is no change. */
export function sameCover(a: CoverArt | null, b: CoverArt | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.mime !== b.mime || a.data.byteLength !== b.data.byteLength) return false;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
  return true;
}

export function coverChange(before: CoverArt | null, after: CoverArt | null): CoverChange | null {
  if (sameCover(before, after)) return null;
  if (!before) return 'added';
  return after ? 'replaced' : 'removed';
}

export function changesOf(f: ChangeInput, pattern: NamePattern): FileChanges {
  const fields = FIELD_ORDER
    .filter(({ key }) => f.read.editable[key] !== f.editable[key])
    .map(({ key, label }) => ({ key, label, before: f.read.editable[key], after: f.editable[key] }));
  const converting = f.read.format !== f.outputFormat;
  const to = buildFilename({
    pattern,
    tags: f.editable,
    originalName: f.file.name,
    extension: f.outputFormat === 'mp3' ? '.mp3' : '.m4a',
  });
  const lost = converting && f.read.carried.format === 'm4a'
    ? mapM4aToId3(f.read.carried.items).dropped
    : f.read.unsupported;
  return {
    fields,
    cover: coverChange(f.read.cover, f.cover),
    format: converting ? { from: f.read.format, to: f.outputFormat } : null,
    name: { from: f.file.name, to },
    lost,
  };
}

/** True when the metadata itself changes: a field or the cover. */
export function hasMetadataChanges(c: FileChanges): boolean {
  return c.fields.length > 0 || c.cover !== null;
}

/** The batch overview: how many files change metadata, convert, or lose fields. */
export function summarize(list: FileChanges[]): { metadata: number; converting: number; losing: number } {
  return {
    metadata: list.filter(hasMetadataChanges).length,
    converting: list.filter((c) => c.format !== null).length,
    losing: list.filter((c) => c.lost.length > 0).length,
  };
}

// Files are replaced, never mutated, when they change, so a file object and a
// pattern pin down the answer. Typing in one file reworks only that one.
const cache = new WeakMap<object, { pattern: NamePattern; changes: FileChanges }>();

export function cachedChangesOf(f: ChangeInput, pattern: NamePattern): FileChanges {
  const hit = cache.get(f);
  if (hit && hit.pattern === pattern) return hit.changes;
  const changes = changesOf(f, pattern);
  cache.set(f, { pattern, changes });
  return changes;
}
