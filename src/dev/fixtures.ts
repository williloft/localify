/**
 * Dev-only datasets for stress-testing the UI (break-ui).
 *
 * They enter at the same boundary as real files: the list of LoadedFile the
 * app holds after parsing. Nothing here ships; App imports this module only
 * behind import.meta.env.DEV, so production builds drop it.
 *
 * Pick one with ?data=demo | worst | empty | one | many.
 */
import type { LoadedFile } from '../lib/loaded';
import type { CoverArt, EditableTags, FileTags } from '../lib/tags';
import { skippedMessage } from '../lib/fieldLabels';

export const DATASETS = ['demo', 'worst', 'empty', 'one', 'many'] as const;
export type Dataset = (typeof DATASETS)[number];

export interface Fixture {
  files: LoadedFile[];
  /** A load-time message, as addFiles would set it. */
  error?: string;
  /** A save-time message, as save would set it. */
  saveNote?: string;
}

/** A solid-colour image of a given shape, so cover handling sees real pixels. */
async function image(w: number, h: number, colour: string): Promise<CoverArt> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, Math.min(w, h) / 4, Math.min(w, h) / 4);
  const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
  return { mime: 'image/png', data: new Uint8Array(await blob.arrayBuffer()) };
}

const EMPTY: EditableTags = { title: '', artist: '', album: '', albumArtist: '', year: '', track: '' };

interface Spec {
  name: string;
  size: number;
  format?: 'mp3' | 'm4a';
  tags?: Partial<EditableTags>;
  cover?: CoverArt | null;
  carried?: string[];
  unsupported?: string[];
  /** M4A item names; the ones without an MP3 counterpart show as "would be lost". */
  m4aItems?: string[];
  durationSec?: number | null;
  sourceVersion?: string;
  dirty?: boolean;
  saved?: boolean;
}

let seq = 0;

function make(s: Spec): LoadedFile {
  const format = s.format ?? 'mp3';
  // The bytes are never parsed in this mode; only name and size are shown.
  const file = new File([new Uint8Array(8)], s.name, { lastModified: 1_700_000_000_000 + seq++ });
  Object.defineProperty(file, 'size', { value: s.size });
  const editable = { ...EMPTY, ...s.tags };
  const read: FileTags = {
    format,
    editable,
    cover: s.cover ?? null,
    carried:
      format === 'm4a'
        ? { format: 'm4a', items: (s.m4aItems ?? []).map((name) => ({ name, raw: new Uint8Array(), text: 'x' })) }
        : { format: 'mp3', frames: [] },
    carriedNames: s.carried ?? [],
    unsupported: s.unsupported ?? [],
    sourceVersion: s.sourceVersion ?? (format === 'm4a' ? 'MP4 (iTunes-tags)' : 'ID3v2.3'),
    durationSec: s.durationSec === undefined ? 214 : s.durationSec,
  };
  return {
    id: `${s.name}-${seq}`,
    file,
    read,
    editable: { ...editable },
    cover: read.cover,
    dirty: s.dirty ?? false,
    saved: s.saved ?? false,
    outputFormat: 'mp3',
  };
}

const DEMO_CARRIED = ['TCOM', 'TCON', 'COMM', 'TPOS'];

async function demo(): Promise<Fixture> {
  const cover = await image(600, 600, '#106c48');
  return {
    files: [
      make({ name: 'blaesten.mp3', size: 7_340_032, cover, carried: DEMO_CARRIED,
        tags: { title: 'Blæsten går frisk', artist: 'Søren Ødegård', album: 'Årstiderne', albumArtist: 'Søren Ødegård', year: '1998', track: '3/12' } }),
      make({ name: 'vinter.mp3', size: 6_291_456, cover, carried: DEMO_CARRIED,
        tags: { title: 'Vinterlys', artist: 'Søren Ødegård', album: 'Årstiderne', year: '1998', track: '4/12' } }),
      make({ name: 'havet.m4a', size: 8_912_896, format: 'm4a', cover, m4aItems: ['©wrt', '©gen'], carried: ['@wrt', '@gen'],
        tags: { title: 'Havet', artist: 'Søren Ødegård', album: 'Årstiderne', year: '1998', track: '5/12' } }),
    ],
  };
}

async function worst(): Promise<Fixture> {
  // Every value below is something a real library contains.
  const longTxxx = [
    'TCOM', 'TCON', 'COMM', 'TPUB', 'TBPM', 'TPOS', 'TCOP', 'USLT', 'TSRC', 'TKEY', 'TLAN', 'TIT1', 'TIT3', 'TEXT',
    'TSOP', 'TSOA', 'TSOT', 'TSO2', 'TMED', 'TDOR', 'WXXX', 'PRIV', 'POPM', 'PCNT',
    'TXXX:REPLAYGAIN_TRACK_GAIN', 'TXXX:REPLAYGAIN_TRACK_PEAK', 'TXXX:REPLAYGAIN_ALBUM_GAIN', 'TXXX:REPLAYGAIN_ALBUM_PEAK',
    'TXXX:MusicBrainz Album Id', 'TXXX:MusicBrainz Artist Id', 'TXXX:MusicBrainz Release Group Id',
    'TXXX:MusicBrainz Release Track Id', 'TXXX:MusicBrainz Album Release Country', 'TXXX:ACOUSTID_FINGERPRINT',
    'TXXX:CATALOGNUMBER', 'TXXX:BARCODE', 'TXXX:SCRIPT', 'TXXX:ARTISTS',
  ];
  const [panorama, tall] = await Promise.all([image(4000, 200, '#0b4f34'), image(200, 4000, '#b3261e')]);
  const broken: CoverArt = { mime: 'image/heic', data: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]) };

  return {
    error: skippedMessage([
      ...Array.from({ length: 14 }, (_, i) => `IMG_20250914_1830${String(i).padStart(2, '0')}_HDR_portrait_edited.HEIC`),
      'Liner notes (scan).pdf',
    ]),
    saveNote:
      'Kunne ikke skrive: Komponist, Sangtekst, MusicBrainz Release Track Id, ACOUSTID_FINGERPRINT. ' +
      'Felter uden MP3-modstykke gik tabt: Kodet med, Gapless-afspilning, Sortering: albumkunstner.',
    files: [
      make({
        name: '01_Blaesten_gaar_frisk_Extended_Club_Remix_feat_Aleksandra_Wisniewska-Kowalczyk_2024_Remaster_FINAL_v12.mp3',
        size: 536_870_912, durationSec: 4321, cover: panorama, carried: longTxxx,
        unsupported: ['TENC', 'TOPE', 'APIC:Back cover', 'APIC:Artist', 'GEOB', 'SYLT'],
        sourceVersion: 'ID3v2.4', dirty: true,
        tags: {
          title: 'Blæsten går frisk (Extended Club Remix feat. Aleksandra Wiśniewska-Kowalczyk) [2024 Remaster]',
          artist: 'Aleksandra Wiśniewska-Kowalczyk & Christopher Alexander Montgomery III',
          album: 'Paramètres de confidentialité: The Complete Recordings 1998–2024 (Deluxe Anniversary Edition)',
          albumArtist: 'Diverse Kunstnere', year: '2024-11-08T00:00:00', track: '128/256',
        },
      }),
      make({
        name: 'IMG_20250914_183022_voice_memo_recording.m4a', size: 0, format: 'm4a', durationSec: null,
        cover: tall, sourceVersion: 'MP4 (ingen tags)',
        m4aItems: ['©too', 'pgap', 'soaa', 'soal', 'soar', 'sonm', 'rtng', '----', 'covr', '©wrt'],
        carried: ['@too', 'pgap', 'soaa', 'soal', 'soar', 'sonm', 'rtng', '----', 'covr', '@wrt'],
      }),
      make({
        name: 'Benachrichtigungseinstellungensymphonieorchesterkonzertaufnahme.mp3', size: 1023, cover: broken,
        tags: { title: 'Benachrichtigungseinstellungensymphonieorchesterkonzertaufnahme', artist: 'J', track: '0' },
      }),
      make({
        name: 'track.mp3', size: 4_194_304, saved: true,
        tags: { title: '春夏秋冬の歌メドレー完全版ライブ録音二〇二四年東京公演', artist: 'نور الهدى عبد الرحمن', album: '王秀英', year: '0', track: '1' },
      }),
      make({
        name: 'emoji.mp3', size: 3_000_000,
        tags: { title: '👩🏽‍💻 Priya - lo-fi beats 🦊🎧', artist: '  Sam   Lee ', album: '<script>alert(1)</script> &amp; **bold**' },
      }),
      make({ name: 'J.mp3', size: 1, tags: { title: 'J', artist: 'Jo' } }),
      make({ name: 'blaesten.mp3', size: 7_340_032, tags: { title: 'Blæsten går frisk', artist: 'Søren Ødegård' } }),
      make({ name: 'blaesten (1).mp3', size: 7_340_032, tags: { title: 'Blæsten går frisk', artist: 'Søren Ødegård' } }),
    ],
  };
}

export async function loadFixture(name: Dataset): Promise<Fixture> {
  switch (name) {
    case 'demo': return demo();
    case 'worst': return worst();
    case 'empty': return { files: [] };
    case 'one': {
      const d = await demo();
      return { files: d.files.slice(0, 1) };
    }
    case 'many': {
      const cover = await image(300, 300, '#106c48');
      return {
        files: Array.from({ length: 1000 }, (_, i) =>
          make({ name: `track-${i + 1}.mp3`, size: 5_000_000, cover,
            tags: { title: `Sang nummer ${i + 1}`, artist: 'Søren Ødegård', track: `${i + 1}/1000` } })),
      };
    }
  }
}
