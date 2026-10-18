/**
 * Human names for the tag fields the editor does not show.
 *
 * The UI lists preserved and unwritable fields by their raw ids ("TCOM",
 * "@wrt"), which mean nothing to most people. These are the names a music
 * player would use. Unknown ids fall back to the raw id, so a new frame type
 * shows up as itself instead of disappearing from the list.
 */

const ID3: Record<string, string> = {
  APIC: 'Ekstra billede',
  COMM: 'Kommentar',
  PCNT: 'Afspilninger',
  POPM: 'Bedømmelse',
  PRIV: 'Private data',
  TBPM: 'BPM',
  TCMP: 'Opsamlingsalbum',
  TCOM: 'Komponist',
  TCON: 'Genre',
  TCOP: 'Copyright',
  TDOR: 'Original udgivelse',
  TDRL: 'Udgivelsesdato',
  TENC: 'Kodet af',
  TEXT: 'Tekstforfatter',
  TIT1: 'Gruppering',
  TIT3: 'Undertitel',
  TKEY: 'Toneart',
  TLAN: 'Sprog',
  TLEN: 'Længde',
  TMED: 'Medie',
  TOAL: 'Originalt album',
  TOPE: 'Original kunstner',
  TORY: 'Originalt år',
  TPE3: 'Dirigent',
  TPE4: 'Remixet af',
  TPOS: 'Disknummer',
  TPUB: 'Udgiver',
  TSO2: 'Sortering: albumkunstner',
  TSOA: 'Sortering: album',
  TSOC: 'Sortering: komponist',
  TSOP: 'Sortering: kunstner',
  TSOT: 'Sortering: titel',
  TSRC: 'ISRC',
  TSSE: 'Encoder-indstillinger',
  USLT: 'Sangtekst',
  WXXX: 'Link',
};

const MP4: Record<string, string> = {
  '@cmt': 'Kommentar',
  '@gen': 'Genre',
  '@grp': 'Gruppering',
  '@lyr': 'Sangtekst',
  '@too': 'Kodet med',
  '@wrt': 'Komponist',
  aART: 'Albumkunstner',
  covr: 'Ekstra billede',
  cpil: 'Opsamlingsalbum',
  cprt: 'Copyright',
  disk: 'Disknummer',
  gnre: 'Genre',
  pgap: 'Gapless-afspilning',
  rtng: 'Aldersgrænse',
  soaa: 'Sortering: albumkunstner',
  soal: 'Sortering: album',
  soar: 'Sortering: kunstner',
  soco: 'Sortering: komponist',
  sonm: 'Sortering: titel',
  tmpo: 'BPM',
};

export function fieldLabel(id: string): string {
  // TXXX:<description> and ----:<namespace>:<name> carry their own name.
  if (id.startsWith('TXXX:')) return id.slice(5) || id;
  if (id.startsWith('----')) {
    const name = id.split(':').slice(2).join(':');
    return name || 'Brugerdefineret felt';
  }
  const [base, ...rest] = id.split(':');
  const label = ID3[base] ?? MP4[id];
  if (!label) return id;
  // "APIC:Back cover" -> "Ekstra billede (Back cover)", so two pictures don't read as one.
  return rest.length ? `${label} (${rest.join(':')})` : label;
}

/** Labels with repeats folded: two plain APIC frames read "Ekstra billede (2)". */
export function fieldLabelList(ids: string[]): string[] {
  const counts = new Map<string, number>();
  for (const id of ids) {
    const l = fieldLabel(id);
    counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  return [...counts].map(([l, n]) => (n > 1 ? `${l} (${n})` : l));
}

export function fieldLabels(ids: string[]): string {
  return fieldLabelList(ids).join(', ');
}

/** Danish count + noun, so "1 felt" never reads "1 felter". */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const NUMBER = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 1 });

/** 2,9 MB and 1.000 numre, the Danish way. */
export function formatNumber(n: number): string {
  return NUMBER.format(n);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${formatNumber(n)} B`;
  if (n < 1024 * 1024) return `${formatNumber(Math.round(n / 1024))} KB`;
  return `${formatNumber(Math.round((n / (1024 * 1024)) * 10) / 10)} MB`;
}

/** 3:34 for a song, "1 t 12 min" for a DJ mix. */
export function formatDuration(sec: number): string {
  const s = Math.round(sec);
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m ? `${h} t ${m} min` : `${h} t`;
  }
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The load-time message for files that are not MP3 or M4A. Names past the third are counted, not listed. */
export function skippedMessage(names: string[]): string {
  const shown = names.slice(0, 3).map((n) => `“${n}”`).join(', ');
  const more = names.length - 3;
  const list = more > 0 ? `${shown} og ${plural(more, 'anden', 'andre')}` : shown;
  return `Sprunget over: ${list}. Kun MP3 og M4A understøttes.`;
}
