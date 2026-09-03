/**
 * One interface over MP3 and M4A.
 *
 * The UI should not care which container it is looking at: the same six fields,
 * the same cover, the same promise that untouched metadata survives. The two
 * formats reach that promise very differently, and the difference is worth
 * knowing:
 *
 *  - MP3 goes through browser-id3-writer, which cannot merge into an existing
 *    tag. Every frame has to be translated into the shape that library expects,
 *    and a frame with no faithful translation is reported as unwritable.
 *  - M4A is rebuilt by our own code, so untouched items are carried as raw
 *    bytes. Nothing is translated, so nothing can be lost.
 *
 * That is why `unsupported` is usually empty for M4A and rarely empty for MP3.
 */

import {
  readTags as readId3,
  writeTags as writeId3,
  type EditableTags,
  type CoverArt,
  type CarriedFrame,
} from './id3';
import { readMp4Tags, writeMp4Tags, type IlstItem, type Mp4Cover } from './mp4';
import { m4aToMp3, DEFAULT_BITRATE } from './transcode';
import { parseBuffer } from 'music-metadata';

export type { EditableTags, CoverArt } from './id3';

export type AudioFormat = 'mp3' | 'm4a';

/** Opaque per-format payload of everything the editor does not show. */
export type Carried =
  | { format: 'mp3'; frames: Awaited<ReturnType<typeof readId3>>['carried'] }
  | { format: 'm4a'; items: IlstItem[] };

export interface FileTags {
  format: AudioFormat;
  editable: EditableTags;
  cover: CoverArt | null;
  carried: Carried;
  /** Names of preserved fields, for display. */
  carriedNames: string[];
  /** Fields that cannot be written back — shown before saving, never dropped quietly. */
  unsupported: string[];
  /** e.g. "ID3v2.3" or "MP4 (iTunes)". */
  sourceVersion: string;
  durationSec: number | null;
}

const MP4_BRANDS = ['ftyp'];

/**
 * Detect by content, not by extension. A file named .mp3 that is really an
 * MPEG-4 container is common enough (downloads, careless converters) that
 * trusting the name would fail on exactly the files people need help with.
 */
export function sniffFormat(buffer: ArrayBuffer): AudioFormat | null {
  const b = new Uint8Array(buffer);
  if (b.length < 12) return null;

  // MP4: a 'ftyp' box at offset 4.
  const tag = String.fromCharCode(b[4], b[5], b[6], b[7]);
  if (MP4_BRANDS.includes(tag)) return 'm4a';

  // MP3: an ID3 tag, or a raw MPEG frame sync.
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return 'mp3';
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'mp3';

  return null;
}

export function acceptsFile(name: string): boolean {
  return /\.(mp3|m4a|m4b|mp4|aac)$/i.test(name);
}

export async function readFileTags(buffer: ArrayBuffer): Promise<FileTags> {
  const format = sniffFormat(buffer);
  if (!format) throw new Error('Ukendt filformat — kun MP3 og M4A understøttes.');

  if (format === 'mp3') {
    const r = await readId3(buffer);
    return {
      format,
      editable: r.editable,
      cover: r.cover,
      carried: { format: 'mp3', frames: r.carried },
      carriedNames: r.carried.map((c) => c.id),
      unsupported: r.unsupported,
      sourceVersion: r.sourceVersion,
      durationSec: r.durationSec,
    };
  }

  const r = readMp4Tags(buffer);
  // Duration is not in ilst; ask the parser that already knows every container.
  let durationSec: number | null = null;
  try {
    const md = await parseBuffer(new Uint8Array(buffer), { mimeType: 'audio/mp4' });
    durationSec = md.format.duration ?? null;
  } catch {
    // A duration we cannot read is cosmetic; never fail the whole read for it.
  }

  return {
    format,
    editable: { ...r.tags, album: r.tags.album },
    cover: r.cover ? { mime: r.cover.mime, data: r.cover.data } : null,
    carried: { format: 'm4a', items: r.carried },
    carriedNames: r.carriedNames,
    // Nothing is translated on this path, so nothing can fail to translate.
    unsupported: [],
    sourceVersion: r.hasIlst ? 'MP4 (iTunes-tags)' : 'MP4 (ingen tags)',
    durationSec,
  };
}

export interface WriteInput {
  buffer: ArrayBuffer;
  format: AudioFormat;
  editable: EditableTags;
  cover: CoverArt | null;
  carried: Carried;
}

export interface WriteOutput {
  blob: Blob;
  /** Fields that failed to write despite being mapped. Always empty for M4A. */
  failed: string[];
}

export function writeFileTags({ buffer, format, editable, cover, carried }: WriteInput): WriteOutput {
  if (format === 'mp3') {
    if (carried.format !== 'mp3') throw new Error('Formatet og de bevarede felter passer ikke sammen.');
    return writeId3({ buffer, editable, cover, carried: carried.frames });
  }

  if (carried.format !== 'm4a') throw new Error('Formatet og de bevarede felter passer ikke sammen.');
  const mp4Cover: Mp4Cover | null = cover ? { mime: cover.mime, data: cover.data } : null;
  const out = writeMp4Tags({
    buffer,
    tags: {
      title: editable.title,
      artist: editable.artist,
      album: editable.album,
      albumArtist: editable.albumArtist,
      year: editable.year,
      track: editable.track,
    },
    cover: mp4Cover,
    carried: carried.items,
  });
  return { blob: new Blob([out as BlobPart], { type: 'audio/mp4' }), failed: [] };
}


// --- converting between containers ------------------------------------------

/**
 * MP4 items that have a faithful ID3 equivalent.
 *
 * Raw MP4 bytes mean nothing inside an MP3, so a format change is the one case
 * where preserved fields must actually be translated. Anything not on this list
 * cannot survive the crossing, and the UI says which ones before you convert
 * rather than dropping them quietly.
 */
type FrameMaker = (text: string) => CarriedFrame | null;

// Partial: an unknown four-char name has no entry, and the lookup must be
// allowed to come back undefined.
const MP4_TO_ID3: Partial<Record<string, FrameMaker>> = {
  '\u00a9wrt': (t) => ({ id: 'TCOM', writerId: 'TCOM', value: [t] }),
  '\u00a9gen': (t) => ({ id: 'TCON', writerId: 'TCON', value: [t] }),
  '\u00a9cmt': (t) => ({ id: 'COMM', writerId: 'COMM', value: { language: 'eng', description: '', text: t } }),
  '\u00a9lyr': (t) => ({ id: 'USLT', writerId: 'USLT', value: { language: 'eng', description: '', lyrics: t } }),
  'cprt': (t) => ({ id: 'TCOP', writerId: 'TCOP', value: t }),
  'disk': (t) => ({ id: 'TPOS', writerId: 'TPOS', value: t }),
  'tmpo': (t) => {
    const n = parseInt(t, 10);
    return Number.isFinite(n) ? { id: 'TBPM', writerId: 'TBPM', value: n } : null;
  },
};

export interface CrossFormatMapping {
  frames: CarriedFrame[];
  /** MP4 fields with no ID3 equivalent — lost if you convert. */
  dropped: string[];
}

export function mapM4aToId3(items: IlstItem[]): CrossFormatMapping {
  const frames: CarriedFrame[] = [];
  const dropped: string[] = [];

  for (const item of items) {
    const make = MP4_TO_ID3[item.name];
    const frame = make && item.text ? make(item.text) : null;
    if (frame) frames.push(frame);
    else dropped.push(item.name.replace('\u00a9', '@'));
  }
  return { frames, dropped };
}

/** What a given source can be saved as. */
export function outputOptionsFor(format: AudioFormat): AudioFormat[] {
  return format === 'mp3' ? ['mp3'] : ['mp3', 'm4a'];
}

export interface ConvertInput extends WriteInput {
  outputFormat: AudioFormat;
  bitrateKbps?: number;
  onProgress?: (fraction: number) => void;
}

export interface ConvertOutput extends WriteOutput {
  /** True when the audio was re-encoded rather than left alone. */
  reencoded: boolean;
  /** Fields lost in the format change. */
  dropped: string[];
  extension: string;
}

/**
 * Save, converting the container if asked.
 *
 * Same-format saves never touch the audio. A conversion re-encodes it, which
 * is lossy — the caller is expected to have made that clear already.
 */
export async function saveFile(input: ConvertInput): Promise<ConvertOutput> {
  const { buffer, format, editable, cover, carried, outputFormat, bitrateKbps, onProgress } = input;

  if (format === outputFormat) {
    const { blob, failed } = writeFileTags({ buffer, format, editable, cover, carried });
    return { blob, failed, reencoded: false, dropped: [], extension: format === 'mp3' ? '.mp3' : '.m4a' };
  }

  if (!(format === 'm4a' && outputFormat === 'mp3')) {
    throw new Error('Den konvertering er ikke understøttet.');
  }
  if (carried.format !== 'm4a') throw new Error('Formatet og de bevarede felter passer ikke sammen.');

  const mp3Audio = await m4aToMp3(buffer, {
    bitrateKbps: bitrateKbps ?? DEFAULT_BITRATE,
    onProgress,
  });

  const { frames, dropped } = mapM4aToId3(carried.items);
  const audioBuffer = mp3Audio.buffer.slice(
    mp3Audio.byteOffset,
    mp3Audio.byteOffset + mp3Audio.byteLength
  ) as ArrayBuffer;

  const { blob, failed } = writeId3({ buffer: audioBuffer, editable, cover, carried: frames });
  return { blob, failed, reencoded: true, dropped, extension: '.mp3' };
}
