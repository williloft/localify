/** Turning loaded files into downloads: one file at a time, or a zip of the whole list. */
import { saveFile } from './tags';
import { buildFilename, sanitizeSegment, type NamePattern } from './filename';
import { fieldLabels } from './fieldLabels';
import type { LoadedFile } from './loaded';

/** Write one file's tags and work out its download name, without downloading it. */
export async function renderFile(
  f: LoadedFile,
  pattern: NamePattern,
  onProgress?: (p: number) => void,
  signal?: AbortSignal
): Promise<{ blob: Blob; name: string; notes: string[] }> {
  const { blob, failed, reencoded, dropped, extension } = await saveFile({
    buffer: await f.file.arrayBuffer(),
    format: f.read.format,
    editable: f.editable,
    cover: f.cover,
    carried: f.read.carried,
    outputFormat: f.outputFormat,
    onProgress,
    signal,
  });
  const notes: string[] = [];
  if (failed.length) notes.push(`Kunne ikke skrive: ${fieldLabels(failed)}`);
  if (reencoded && dropped.length) notes.push(`Felter uden MP3-modstykke gik tabt: ${fieldLabels(dropped)}`);
  const name = buildFilename({ pattern, tags: f.editable, originalName: f.file.name, extension });
  return { blob, name, notes };
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** "Song.mp3", then "Song (2).mp3": two tracks with the same title must not overwrite each other in the zip. */
export function uniqueName(name: string, used: Set<string>): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let candidate = name;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

/** Named after the album when every file shares one, which is the usual case. */
export function zipName(files: LoadedFile[]): string {
  const albums = new Set(files.map((f) => f.editable.album.trim()).filter(Boolean));
  // Same cap as single files: room for the extension inside the 255-byte name limit.
  const album = albums.size === 1 ? sanitizeSegment([...albums][0]).slice(0, 180).trimEnd() : '';
  return `${album || 'Localify'}.zip`;
}
