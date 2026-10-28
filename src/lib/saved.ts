import type { LoadedFile } from './loaded';

/**
 * Mark as saved only the file objects that went into an export.
 *
 * An edit replaces a file's object, so a file whose current object is not the
 * exported snapshot has been changed since, and stays unsaved.
 */
export function markSaved(files: LoadedFile[], exported: ReadonlySet<LoadedFile>): LoadedFile[] {
  return files.map((f) => (exported.has(f) ? { ...f, dirty: false, saved: true } : f));
}

/** Removing a file loses its edits only when it has unsaved ones. */
export function removalNeedsConfirm(file: Pick<LoadedFile, 'dirty'> | undefined): boolean {
  return !!file?.dirty;
}
