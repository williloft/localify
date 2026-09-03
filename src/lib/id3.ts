import { parseBuffer } from 'music-metadata';
import { ID3Writer } from 'browser-id3-writer';

/** One frame as music-metadata reports it. Its own dict type widens to unknown. */
interface NativeFrame {
  id: string;
  value: unknown;
}

/** The six fields the UI lets you edit. */
export interface EditableTags {
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  year: string;
  track: string;
}

export interface CoverArt {
  mime: string;
  data: Uint8Array;
}

/** A frame we read but do not show — carried through the write untouched. */
export interface CarriedFrame {
  id: string;
  writerId: string;
  value: unknown;
}

export interface ReadResult {
  editable: EditableTags;
  cover: CoverArt | null;
  /** Frames that will be preserved on write. */
  carried: CarriedFrame[];
  /** Frames we could read but cannot write back — reported, never dropped silently. */
  unsupported: string[];
  /** Which ID3 version the source used, for display. */
  sourceVersion: string;
  durationSec: number | null;
}

const EMPTY: EditableTags = {
  title: '', artist: '', album: '', albumArtist: '', year: '', track: '',
};

/** Frames the UI owns. Never carried — we write our own values for these. */
const EDITED = new Set(['TIT2', 'TPE1', 'TALB', 'TPE2', 'TYER', 'TRCK', 'APIC']);

/** v2.4 ids that mean the same thing as a v2.3 id we can write. */
const V24_ALIASES: Record<string, string> = {
  TDRC: 'TYER',   // recording time -> year
  TDOR: 'TYER',
  TSST: 'TIT3',
};

/** Text frames the writer takes as a plain string. */
const STRING_FRAMES = new Set([
  'TALB', 'TCOP', 'TCMP', 'TDAT', 'TEXT', 'TIT1', 'TIT2', 'TIT3', 'TKEY',
  'TLAN', 'TMED', 'TPE2', 'TPE3', 'TPE4', 'TPOS', 'TPUB', 'TRCK', 'TSRC',
  'TSSE',
]);
/** URL frames — plain string, written as ISO-8859-1 by the writer. */
const URL_FRAMES = new Set([
  'WCOM', 'WCOP', 'WOAF', 'WOAR', 'WOAS', 'WORS', 'WPAY', 'WPUB',
]);
/** Frames the writer wants as an array of strings. */
const ARRAY_FRAMES = new Set(['TCOM', 'TCON', 'TPE1']);
/** Frames the writer parses as an integer. */
const INT_FRAMES = new Set(['TBPM', 'TLEN', 'TYER']);

function str(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return '';
}

/**
 * Translate one frame as music-metadata reports it into the shape
 * browser-id3-writer's setFrame expects. Returns null when we have no faithful
 * mapping — the caller reports those rather than writing something wrong.
 */
function toWriterValue(writerId: string, raw: unknown): unknown | null {
  if (STRING_FRAMES.has(writerId) || URL_FRAMES.has(writerId)) {
    const s = str(raw);
    return s ? s : null;
  }
  if (ARRAY_FRAMES.has(writerId)) {
    if (Array.isArray(raw)) return raw.map(str).filter(Boolean);
    const s = str(raw);
    return s ? [s] : null;
  }
  if (INT_FRAMES.has(writerId)) {
    const n = parseInt(str(raw), 10);
    return Number.isFinite(n) ? n : null;
  }

  const o = raw as Record<string, unknown> | null;

  switch (writerId) {
    case 'TXXX': {
      // music-metadata reports these as id "TXXX:<description>" with a string
      // value; the description is recovered by the caller and passed through.
      return null; // handled specially in readTags/writeTags
    }
    case 'COMM': {
      if (!o || typeof o !== 'object') return null;
      return {
        language: str(o.language) || 'eng',
        description: str(o.descriptor ?? o.description),
        text: str(o.text),
      };
    }
    case 'USLT': {
      if (!o || typeof o !== 'object') return null;
      return {
        language: str(o.language) || 'eng',
        description: str(o.descriptor ?? o.description),
        lyrics: str(o.text ?? o.lyrics),
      };
    }
    case 'PRIV': {
      if (!o || typeof o !== 'object') return null;
      const data = o.data;
      if (!(data instanceof Uint8Array)) return null;
      const id = str(o.owner_identifier ?? o.id);
      if (!id) return null;
      return { id, data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
    }
    default:
      return null;
  }
}

export async function readTags(buffer: ArrayBuffer): Promise<ReadResult> {
  const md = await parseBuffer(new Uint8Array(buffer), { mimeType: 'audio/mpeg' });

  const native = md.native as unknown as Record<string, NativeFrame[] | undefined>;
  // Prefer the richest ID3v2 tag present.
  const version =
    (['ID3v2.4', 'ID3v2.3', 'ID3v2.2'] as const).find((v) => v in native) ?? null;
  const frames: NativeFrame[] = version ? native[version] ?? [] : [];

  const editable: EditableTags = { ...EMPTY };
  let cover: CoverArt | null = null;
  const carried: CarriedFrame[] = [];
  const unsupported: string[] = [];

  for (const frame of frames) {
    const rawId = frame.id;
    const baseId = rawId.split(':')[0];
    const writerId = V24_ALIASES[baseId] ?? baseId;

    // --- the six editable fields ---
    if (writerId === 'TIT2') { editable.title = str(frame.value); continue; }
    if (writerId === 'TPE1') {
      editable.artist = Array.isArray(frame.value)
        ? frame.value.map(str).join('/')
        : str(frame.value);
      continue;
    }
    if (writerId === 'TALB') { editable.album = str(frame.value); continue; }
    if (writerId === 'TPE2') { editable.albumArtist = str(frame.value); continue; }
    if (writerId === 'TYER') {
      // TDRC may be a full timestamp — keep just the year.
      editable.year = str(frame.value).slice(0, 4);
      continue;
    }
    if (writerId === 'TRCK') { editable.track = str(frame.value); continue; }

    // --- cover art ---
    if (baseId === 'APIC') {
      const v = frame.value as { format?: string; data?: Uint8Array; type?: string };
      // Only the front cover is shown; other picture types ride along as carried.
      if (!cover && v?.data instanceof Uint8Array) {
        cover = { mime: v.format || 'image/jpeg', data: v.data };
        continue;
      }
      unsupported.push(rawId);
      continue;
    }

    // --- TXXX keeps its description in the id ---
    if (baseId === 'TXXX') {
      const description = rawId.includes(':') ? rawId.slice(rawId.indexOf(':') + 1) : '';
      carried.push({
        id: rawId,
        writerId: 'TXXX',
        value: { description, value: str(frame.value) },
      });
      continue;
    }

    if (EDITED.has(writerId)) continue;

    const mapped = toWriterValue(writerId, frame.value);
    if (mapped === null) {
      unsupported.push(rawId);
      continue;
    }
    carried.push({ id: rawId, writerId, value: mapped });
  }

  return {
    editable,
    cover,
    carried,
    unsupported,
    sourceVersion: version ?? 'ingen tag',
    durationSec: md.format.duration ?? null,
  };
}

export interface WriteInput {
  /** The ORIGINAL file bytes. The writer strips the old tag itself. */
  buffer: ArrayBuffer;
  editable: EditableTags;
  cover: CoverArt | null;
  carried: CarriedFrame[];
}

export interface WriteResult {
  blob: Blob;
  /** Frames that failed to write despite being mapped — surfaced, not swallowed. */
  failed: string[];
}

export function writeTags({ buffer, editable, cover, carried }: WriteInput): WriteResult {
  const writer = new ID3Writer(buffer);
  const failed: string[] = [];

  const set = (id: string, value: unknown, label = id) => {
    try {
      // The overloads are exhaustive per-id; this call site is dynamic by design.
      (writer.setFrame as (i: string, v: unknown) => unknown)(id, value);
    } catch {
      failed.push(label);
    }
  };

  // Carried frames first so an edited field always wins if both target the
  // same id.
  for (const f of carried) set(f.writerId, f.value, f.id);

  if (editable.title) set('TIT2', editable.title);
  if (editable.artist) set('TPE1', editable.artist.split('/').map((s) => s.trim()).filter(Boolean));
  if (editable.album) set('TALB', editable.album);
  if (editable.albumArtist) set('TPE2', editable.albumArtist);
  if (editable.year) {
    const y = parseInt(editable.year, 10);
    if (Number.isFinite(y)) set('TYER', y);
  }
  if (editable.track) set('TRCK', editable.track);

  if (cover) {
    const data = cover.data;
    set('APIC', {
      type: 3,
      data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      description: 'Cover',
    });
  }

  writer.addTag();
  return { blob: writer.getBlob(), failed };
}
