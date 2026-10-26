/**
 * Shared metadata: copy chosen fields from one file to the marked ones, and
 * take it back again.
 *
 * Only album, album artist, year, cover and, as its own choice, artist can be
 * copied. Title and track number are never touched here: they belong to the
 * track, not the album. Everything happens in memory; nothing is saved or
 * downloaded until the user exports as usual.
 */

import type { CoverArt, EditableTags } from './tags';

export type SharedField = 'album' | 'albumArtist' | 'year' | 'cover' | 'artist';

/** In the order the panel lists them. Artist last, as the separate choice it is. */
export const SHARED_FIELDS: SharedField[] = ['album', 'albumArtist', 'year', 'cover', 'artist'];

export const SHARED_LABELS: Record<SharedField, string> = {
  album: 'Album',
  albumArtist: 'Albumkunstner',
  year: 'År',
  cover: 'Cover',
  artist: 'Kunstner',
};

/** "Album, år og cover", for the receipt. */
export function sharedFieldList(fields: SharedField[]): string {
  const names = fields.map((f, i) => (i === 0 ? SHARED_LABELS[f] : SHARED_LABELS[f].toLowerCase()));
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} og ${names[names.length - 1]}` : names[0] ?? '';
}

/** What a file needs for this to work on it. LoadedFile fits. */
export interface SharedTarget {
  id: string;
  editable: EditableTags;
  cover: CoverArt | null;
  dirty: boolean;
  saved: boolean;
}

type Value = string | CoverArt | null;

function valueOf(f: SharedTarget, field: SharedField): Value {
  return field === 'cover' ? f.cover : f.editable[field];
}

/**
 * An empty source field cannot be used: copying it would quietly wipe the
 * targets' own values. A blank-looking text counts as empty.
 */
export function canShare(source: SharedTarget, field: SharedField): boolean {
  const v = valueOf(source, field);
  return field === 'cover' ? v !== null : typeof v === 'string' && v.trim() !== '';
}

/** Everything needed to undo one shared edit. */
export interface SharedEdit {
  fields: SharedField[];
  /** The values that were written, to tell later edits apart from this one. */
  values: Partial<Record<SharedField, Value>>;
  targets: {
    id: string;
    before: Partial<Record<SharedField, Value>>;
    dirty: boolean;
    saved: boolean;
    /** The file as the edit left it. */
    after: SharedTarget;
  }[];
}

function withValue<T extends SharedTarget>(f: T, field: SharedField, value: Value): T {
  return field === 'cover'
    ? { ...f, cover: value as CoverArt | null }
    : { ...f, editable: { ...f.editable, [field]: value as string } };
}

/**
 * Copy `fields` from `source` to every file in `targetIds` except the source
 * itself. Fields the source cannot share are ignored, never written as empty.
 */
export function applyShared<T extends SharedTarget>(
  files: T[],
  source: SharedTarget,
  targetIds: ReadonlySet<string>,
  fields: SharedField[]
): { files: T[]; edit: SharedEdit | null } {
  const usable = SHARED_FIELDS.filter((f) => fields.includes(f) && canShare(source, f));
  const ids = new Set([...targetIds].filter((id) => id !== source.id));
  if (usable.length === 0 || ids.size === 0) return { files, edit: null };

  const values: SharedEdit['values'] = {};
  for (const f of usable) values[f] = valueOf(source, f);

  const targets: SharedEdit['targets'] = [];
  const next = files.map((file) => {
    if (!ids.has(file.id)) return file;
    const before: SharedEdit['targets'][number]['before'] = {};
    let out = file;
    for (const f of usable) {
      before[f] = valueOf(file, f);
      out = withValue(out, f, values[f]!);
    }
    const after = { ...out, dirty: true, saved: false };
    targets.push({ id: file.id, before, dirty: file.dirty, saved: file.saved, after });
    return after;
  });
  return { files: next, edit: { fields: usable, values, targets } };
}

/**
 * Put every target's own values back. A field changed again since the shared
 * edit is left as it is now and reported, so undo never overwrites later work.
 */
export function undoShared<T extends SharedTarget>(
  files: T[],
  edit: SharedEdit
): { files: T[]; kept: { id: string; field: SharedField }[] } {
  const byId = new Map(edit.targets.map((t) => [t.id, t]));
  const kept: { id: string; field: SharedField }[] = [];
  const next = files.map((file) => {
    const t = byId.get(file.id);
    if (!t) return file;
    let out = file;
    let all = true;
    for (const f of edit.fields) {
      if (valueOf(file, f) === edit.values[f]) out = withValue(out, f, t.before[f] ?? (f === 'cover' ? null : ''));
      else { kept.push({ id: file.id, field: f }); all = false; }
    }
    // Back to how it was, saved state included, only when nothing else changed
    // since: any later edit replaces the file object, so identity tells.
    const untouched = all && file === t.after;
    return untouched ? { ...out, dirty: t.dirty, saved: t.saved } : { ...out, dirty: true, saved: false };
  });
  return { files: next, kept };
}
