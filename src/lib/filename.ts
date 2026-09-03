import type { EditableTags } from './id3';

export type NamePattern =
  | 'original'
  | 'title-artist'
  | 'title_artist'
  | 'artist-title'
  | 'track-title';

export const PATTERNS: { value: NamePattern; label: string }[] = [
  { value: 'original', label: 'Som originalen' },
  { value: 'title-artist', label: 'Titel - Kunstner' },
  { value: 'title_artist', label: 'Titel_Kunstner' },
  { value: 'artist-title', label: 'Kunstner - Titel' },
  { value: 'track-title', label: 'Spor - Titel' },
];

/** Windows reserves these, with or without an extension. */
const RESERVED = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  ...Array.from({ length: 10 }, (_, i) => `COM${i}`),
  ...Array.from({ length: 10 }, (_, i) => `LPT${i}`),
]);

/** Characters Windows forbids in a filename. Hyphens and spaces are legal. */
const ILLEGAL = /[<>:"/\\|?*]/g;

/**
 * Make one path segment safe on Windows, macOS and Linux.
 * Windows is the strict one: it forbids the characters above plus the C0
 * control range, and a name may not end in a space or a period. Hyphens and
 * spaces are fine, so "Rock-n-Roll" survives intact.
 */
export function sanitizeSegment(input: string): string {
  const printable = Array.from(input)
    .filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127)
    .join('');
  return printable
    .replace(ILLEGAL, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
}

function splitExt(filename: string): { stem: string; ext: string } {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) return { stem: filename, ext: '.mp3' };
  return { stem: filename.slice(0, dot), ext: filename.slice(dot) };
}

/** Track "3/12" -> "03". A bare "3" -> "03". Anything odd -> ''. */
function trackPrefix(track: string): string {
  const n = parseInt(track.split('/')[0], 10);
  return Number.isFinite(n) && n > 0 ? String(n).padStart(2, '0') : '';
}

export interface BuildNameInput {
  pattern: NamePattern;
  tags: EditableTags;
  originalName: string;
  /** Overrides the source extension — set when the container is changing. */
  extension?: string;
}

/**
 * Build the download filename.
 *
 * Two rules keep this from destroying someone's library:
 *  - a pattern that cannot be filled falls back to the original name rather
 *    than producing something like " - .mp3";
 *  - a result identical to the source file gets a "(rettet)" suffix, because a
 *    same-name download either stacks up as "(1)" or, if the browser asks and
 *    the user picks replace, silently overwrites the original.
 */
export function buildFilename({ pattern, tags, originalName, extension }: BuildNameInput): string {
  const { stem: originalStem, ext: sourceExt } = splitExt(originalName);
  const ext = extension ?? sourceExt;

  const title = sanitizeSegment(tags.title);
  const artist = sanitizeSegment(tags.artist);
  const track = trackPrefix(tags.track);

  let stem = '';
  switch (pattern) {
    case 'title-artist':
      if (title && artist) stem = `${title} - ${artist}`;
      else if (title) stem = title;
      break;
    case 'title_artist':
      if (title && artist) stem = `${title}_${artist}`;
      else if (title) stem = title;
      break;
    case 'artist-title':
      if (title && artist) stem = `${artist} - ${title}`;
      else if (title) stem = title;
      break;
    case 'track-title':
      if (track && title) stem = `${track} - ${title}`;
      else if (title) stem = title;
      break;
    case 'original':
      break;
  }

  if (!stem) stem = sanitizeSegment(originalStem) || 'track';

  // Reserved device names are rejected by Windows even with an extension.
  if (RESERVED.has(stem.toUpperCase())) stem = `${stem}_`;

  // Never hand back the exact source filename.
  if (`${stem}${ext}`.toLowerCase() === originalName.toLowerCase()) {
    stem = `${stem} (rettet)`;
  }

  // Leave room for the extension inside the 255-byte path segment limit.
  if (stem.length > 180) {
    stem = stem.slice(0, 180).trimEnd().replace(/[. ]+$/, '');
  }

  return `${stem}${ext}`;
}
