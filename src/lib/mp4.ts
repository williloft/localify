/**
 * MP4 / M4A metadata reader and writer.
 *
 * There is no maintained browser library for writing MP4 metadata, so this is
 * a focused implementation: it understands just enough of the box structure to
 * rewrite `moov/udta/meta/ilst` and leave everything else byte-identical.
 *
 * Two things make this harder than it looks:
 *
 *  1. `meta` is a FullBox — four bytes of version/flags sit between its header
 *     and its children. Miss them and every child parses as garbage. Some
 *     writers omit them, so we sniff rather than assume.
 *
 *  2. `stco` holds ABSOLUTE file offsets into the audio in `mdat`. If `moov`
 *     sits before `mdat` and changes size, every one of those offsets moves.
 *     Get this wrong and the file still looks fine — right size, valid boxes,
 *     tags read back correctly — but the audio is silently broken. So after
 *     reassembling we measure where `mdat` actually landed and patch the
 *     tables by the real delta.
 */

const CONTAINERS = new Set([
  'moov', 'trak', 'mdia', 'minf', 'stbl', 'udta', 'ilst', 'edts',
]);

export interface Box {
  type: string;
  /** Offset of the box header within its parent buffer. */
  start: number;
  /** Offset one past the end of the box. */
  end: number;
  /** 8, or 16 when a 64-bit size is used. */
  headerSize: number;
}

const td = new TextDecoder('utf-8');
const te = new TextEncoder();

/**
 * Box types are four Latin-1 bytes, not UTF-8. Apple's names start with 0xA9
 * ('©'), which is invalid on its own as UTF-8 — decoding them as UTF-8 turns
 * every one of them into a replacement character, so '©nam' stops matching.
 */
function fourCC(bytes: Uint8Array): string {
  return String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
}

export function parseBoxes(buf: Uint8Array, start = 0, end = buf.length): Box[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const boxes: Box[] = [];
  let off = start;

  while (off + 8 <= end) {
    let size = view.getUint32(off);
    let headerSize = 8;

    if (size === 1) {
      if (off + 16 > end) break;
      // 64-bit sizes above 2^53 cannot be represented exactly; such a file is
      // far beyond anything a browser can hold in memory anyway.
      size = Number(view.getBigUint64(off + 8));
      headerSize = 16;
    } else if (size === 0) {
      size = end - off;
    }

    if (size < headerSize || off + size > end) break;

    boxes.push({
      type: fourCC(buf.subarray(off + 4, off + 8)),
      start: off,
      end: off + size,
      headerSize,
    });
    off += size;
  }
  return boxes;
}

/** Children of a container box, accounting for `meta`'s FullBox header. */
export function childrenOf(buf: Uint8Array, box: Box): Box[] {
  let contentStart = box.start + box.headerSize;

  if (box.type === 'meta') {
    // Apple writes meta as a FullBox; some tools don't. If the four bytes look
    // like a plausible box size for the remaining space, assume they're absent.
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const maybeSize = view.getUint32(contentStart);
    const remaining = box.end - contentStart;
    if (!(maybeSize >= 8 && maybeSize <= remaining)) contentStart += 4;
  }
  return parseBoxes(buf, contentStart, box.end);
}

/** Walk a path like ['moov','udta','meta','ilst']. Returns null if absent. */
export function findPath(buf: Uint8Array, path: string[]): Box | null {
  let level = parseBoxes(buf);
  let found: Box | null = null;

  for (const want of path) {
    found = level.find((b) => b.type === want) ?? null;
    if (!found) return null;
    level = CONTAINERS.has(found.type) || found.type === 'meta'
      ? childrenOf(buf, found)
      : [];
  }
  return found;
}

// --- ilst items -------------------------------------------------------------

/** Well-known data type indicators inside a `data` box. */
const DATA_TEXT = 1;
const DATA_BINARY = 0;
const DATA_JPEG = 13;
const DATA_PNG = 14;

export interface IlstItem {
  /** Four-character name, e.g. '©nam' or 'trkn'. */
  name: string;
  /** The item's complete bytes, header included — carried through untouched. */
  raw: Uint8Array;
  /**
   * Decoded value, when the item holds text or a simple pair. Only needed when
   * converting to another container, where the raw bytes are meaningless and
   * the value has to be re-expressed as an ID3 frame.
   */
  text?: string;
}

export interface Mp4Cover {
  mime: string;
  data: Uint8Array;
}

export interface Mp4Tags {
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  year: string;
  track: string;
}

/** ilst names for the fields the editor owns. */
const FIELD_NAMES: Record<keyof Mp4Tags, string> = {
  title: '©nam',
  artist: '©ART',
  album: '©alb',
  albumArtist: 'aART',
  year: '©day',
  track: 'trkn',
};
const OWNED = new Set([...Object.values(FIELD_NAMES), 'covr']);

/** Read the first `data` box inside an ilst item. */
function readData(buf: Uint8Array, item: Box): { type: number; payload: Uint8Array } | null {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  for (const child of parseBoxes(buf, item.start + item.headerSize, item.end)) {
    if (child.type !== 'data') continue;
    const body = child.start + child.headerSize;
    if (body + 8 > child.end) return null;
    return {
      type: view.getUint32(body) & 0x00ffffff,
      payload: buf.subarray(body + 8, child.end),
    };
  }
  return null;
}

export interface Mp4ReadResult {
  tags: Mp4Tags;
  cover: Mp4Cover | null;
  /** Every ilst item the editor does not own, kept as raw bytes. */
  carried: IlstItem[];
  /** Names of carried items, for display. */
  carriedNames: string[];
  hasIlst: boolean;
}

export function readMp4Tags(buffer: ArrayBuffer): Mp4ReadResult {
  const buf = new Uint8Array(buffer);
  const empty: Mp4Tags = { title: '', artist: '', album: '', albumArtist: '', year: '', track: '' };
  const ilst = findPath(buf, ['moov', 'udta', 'meta', 'ilst']);

  if (!ilst) {
    return { tags: empty, cover: null, carried: [], carriedNames: [], hasIlst: false };
  }

  const tags = { ...empty };
  let cover: Mp4Cover | null = null;
  const carried: IlstItem[] = [];

  const byName = new Map(Object.entries(FIELD_NAMES).map(([k, v]) => [v, k as keyof Mp4Tags]));

  for (const item of parseBoxes(buf, ilst.start + ilst.headerSize, ilst.end)) {
    if (!OWNED.has(item.type)) {
      const d = readData(buf, item);
      let text: string | undefined;
      if (d) {
        if (d.type === DATA_TEXT) {
          text = td.decode(d.payload);
        } else if (item.type === 'disk' && d.payload.length >= 6) {
          const no = (d.payload[2] << 8) | d.payload[3];
          const of = (d.payload[4] << 8) | d.payload[5];
          if (no) text = of ? `${no}/${of}` : String(no);
        } else if (item.type === 'tmpo' && d.payload.length >= 2) {
          text = String((d.payload[0] << 8) | d.payload[1]);
        }
      }
      carried.push({ name: item.type, raw: buf.slice(item.start, item.end), text });
      continue;
    }

    const data = readData(buf, item);
    if (!data) continue;

    if (item.type === 'covr') {
      cover = {
        mime: data.type === DATA_PNG ? 'image/png' : 'image/jpeg',
        data: data.payload.slice(),
      };
      continue;
    }

    if (item.type === 'trkn') {
      // 2 reserved, 2 track, 2 total, 2 reserved.
      if (data.payload.length >= 6) {
        const no = (data.payload[2] << 8) | data.payload[3];
        const of = (data.payload[4] << 8) | data.payload[5];
        tags.track = no ? (of ? `${no}/${of}` : String(no)) : '';
      }
      continue;
    }

    const field = byName.get(item.type);
    if (field) tags[field] = td.decode(data.payload);
  }

  return {
    tags,
    cover,
    carried,
    carriedNames: carried.map((c) => c.name.replace('©', '@')),
    hasIlst: true,
  };
}

// --- building ---------------------------------------------------------------

function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const payloadLen = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(8 + payloadLen);
  new DataView(out.buffer).setUint32(0, out.length);
  // Four-char names are Latin-1: '©' is a single byte 0xA9, not UTF-8's two.
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i) & 0xff;
  let off = 8;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function dataBox(typeIndicator: number, payload: Uint8Array): Uint8Array {
  const head = new Uint8Array(8);
  new DataView(head.buffer).setUint32(0, typeIndicator);
  return box('data', head, payload);
}

function textItem(name: string, value: string): Uint8Array {
  return box(name, dataBox(DATA_TEXT, te.encode(value)));
}

function trackItem(track: string): Uint8Array | null {
  const [noStr, ofStr] = track.split('/');
  const no = parseInt(noStr, 10);
  if (!Number.isFinite(no) || no <= 0) return null;
  const of = parseInt(ofStr ?? '', 10);
  const payload = new Uint8Array(8);
  const view = new DataView(payload.buffer);
  view.setUint16(2, no);
  view.setUint16(4, Number.isFinite(of) && of > 0 ? of : 0);
  return box('trkn', dataBox(DATA_BINARY, payload));
}

function coverItem(cover: Mp4Cover): Uint8Array {
  const isPng = cover.mime.includes('png');
  return box('covr', dataBox(isPng ? DATA_PNG : DATA_JPEG, cover.data));
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

export interface Mp4WriteInput {
  buffer: ArrayBuffer;
  tags: Mp4Tags;
  cover: Mp4Cover | null;
  carried: IlstItem[];
}

/**
 * Rebuild the file with a new ilst, leaving every other box byte-identical and
 * fixing chunk offsets if the audio moved.
 */
export function writeMp4Tags({ buffer, tags, cover, carried }: Mp4WriteInput): Uint8Array {
  const buf = new Uint8Array(buffer);

  const moov = findPath(buf, ['moov']);
  if (!moov) throw new Error('Ingen moov-boks — filen ligner ikke en MP4.');

  // 1. New ilst: carried items first, then the fields we own.
  const items: Uint8Array[] = carried.map((c) => c.raw);
  for (const [field, name] of Object.entries(FIELD_NAMES) as [keyof Mp4Tags, string][]) {
    const value = tags[field];
    if (!value) continue;
    if (name === 'trkn') {
      const t = trackItem(value);
      if (t) items.push(t);
    } else {
      items.push(textItem(name, value));
    }
  }
  if (cover) items.push(coverItem(cover));

  const ilst = box('ilst', concat(items));

  // 2. Rebuild meta (FullBox: four zero bytes before children), keeping the
  //    original hdlr so players still recognise the metadata.
  const oldMeta = findPath(buf, ['moov', 'udta', 'meta']);
  const hdlr = oldMeta
    ? childrenOf(buf, oldMeta).find((b) => b.type === 'hdlr')
    : null;
  const hdlrBytes = hdlr ? buf.slice(hdlr.start, hdlr.end) : defaultHdlr();
  const meta = box('meta', new Uint8Array(4), hdlrBytes, ilst);

  // 3. Rebuild udta, preserving any of its other children.
  const oldUdta = findPath(buf, ['moov', 'udta']);
  const udtaOthers = oldUdta
    ? childrenOf(buf, oldUdta).filter((b) => b.type !== 'meta').map((b) => buf.slice(b.start, b.end))
    : [];
  const udta = box('udta', ...udtaOthers, meta);

  // 4. Rebuild moov, preserving every child except udta.
  const moovOthers = childrenOf(buf, moov)
    .filter((b) => b.type !== 'udta')
    .map((b) => buf.slice(b.start, b.end));
  const newMoov = box('moov', ...moovOthers, udta);

  // 5. Reassemble, keeping top-level order.
  const top = parseBoxes(buf);
  const parts = top.map((b) => (b.type === 'moov' ? newMoov : buf.slice(b.start, b.end)));
  const out = concat(parts);

  // 6. Chunk offsets are absolute. Measure how far the audio actually moved.
  const oldMdat = top.find((b) => b.type === 'mdat');
  if (oldMdat) {
    const newTop = parseBoxes(out);
    const newMdat = newTop.find((b) => b.type === 'mdat');
    const delta = (newMdat?.start ?? oldMdat.start) - oldMdat.start;
    if (delta !== 0) shiftChunkOffsets(out, delta);
  }

  return out;
}

function defaultHdlr(): Uint8Array {
  // version/flags, predefined, handler type 'mdir', 'appl', reserved, empty name
  const body = new Uint8Array(21);
  body.set(te.encode('mdir'), 8);
  body.set(te.encode('appl'), 12);
  return box('hdlr', body);
}

/** Add `delta` to every stco/co64 entry inside moov. */
function shiftChunkOffsets(buf: Uint8Array, delta: number): void {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const moov = findPath(buf, ['moov']);
  if (!moov) return;

  for (const trak of childrenOf(buf, moov).filter((b) => b.type === 'trak')) {
    const mdia = childrenOf(buf, trak).find((b) => b.type === 'mdia');
    if (!mdia) continue;
    const minf = childrenOf(buf, mdia).find((b) => b.type === 'minf');
    if (!minf) continue;
    const stbl = childrenOf(buf, minf).find((b) => b.type === 'stbl');
    if (!stbl) continue;

    for (const t of childrenOf(buf, stbl)) {
      if (t.type !== 'stco' && t.type !== 'co64') continue;
      const body = t.start + t.headerSize;
      const count = view.getUint32(body + 4); // after version/flags
      let off = body + 8;

      for (let i = 0; i < count; i++) {
        if (t.type === 'stco') {
          if (off + 4 > t.end) break;
          view.setUint32(off, view.getUint32(off) + delta);
          off += 4;
        } else {
          if (off + 8 > t.end) break;
          view.setBigUint64(off, view.getBigUint64(off) + BigInt(delta));
          off += 8;
        }
      }
    }
  }
}
