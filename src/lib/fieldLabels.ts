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
  if (id.startsWith('----')) return id.split(':').pop() || id;
  return ID3[id.split(':')[0]] ?? MP4[id] ?? id;
}

export function fieldLabels(ids: string[]): string {
  return ids.map(fieldLabel).join(', ');
}

/** Danish count + noun, so "1 felt" never reads "1 felter". */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
