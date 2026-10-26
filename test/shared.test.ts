/**
 * Shared metadata: subset and all, field choice, mixed original values, empty
 * source fields, title and track untouched, undo — and an export of real MP3
 * and M4A files afterwards, with the rest of their tags still there.
 */
import { readFileSync } from 'fs';
import { readFileTags, saveFile, type AudioFormat, type CoverArt, type EditableTags, type FileTags } from '../src/lib/tags';
import { applyShared, canShare, undoShared, type SharedTarget } from '../src/lib/shared';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${msg}`);
  if (!cond) failures++;
};

const tags = (t: Partial<EditableTags>): EditableTags => ({ title: '', artist: '', album: '', albumArtist: '', year: '', track: '', ...t });
const cover = (n: number): CoverArt => ({ mime: 'image/png', data: new Uint8Array([n]) });
const file = (id: string, t: Partial<EditableTags>, c: CoverArt | null = null, dirty = false, saved = false): SharedTarget =>
  ({ id, editable: tags(t), cover: c, dirty, saved });

console.log('\n=== fælles rettelse ===');
const src = file('a', { title: 'Et', track: '1', album: 'Årstiderne', albumArtist: 'Diverse', year: '1998', artist: 'Søren' }, cover(1));
const files = [
  src,
  file('b', { title: 'To', track: '2', album: 'Gammelt', year: '2001', artist: 'Anden' }, cover(2), false, true),
  file('c', { title: 'Tre', track: '3', album: 'Andet', albumArtist: 'Nogen', artist: 'Tredje' }, null),
  file('d', { title: 'Fire', track: '4', album: 'Urørt' }),
];

// Subset, album + year only.
let r = applyShared(files, src, new Set(['b', 'c']), ['album', 'year']);
ok(r.edit !== null && r.edit.targets.length === 2, 'delmængde: præcis 2 mål-filer');
ok(r.files[1].editable.album === 'Årstiderne' && r.files[2].editable.year === '1998', 'album og år sat på målene');
ok(r.files[1].editable.title === 'To' && r.files[1].editable.track === '2', 'titel og spornummer urørt');
ok(r.files[1].editable.artist === 'Anden' && r.files[2].editable.albumArtist === 'Nogen', 'ikke-valgte felter urørt');
ok(r.files[1].cover === files[1].cover, 'cover urørt, når det ikke er valgt');
ok(r.files[3] === files[3], 'ikke-markeret fil er samme objekt');
ok(r.files[1].dirty && !r.files[1].saved, 'mål markeres som ugemte');

// All, including the source itself: the source is not a target.
r = applyShared(files, src, new Set(['a', 'b', 'c', 'd']), ['albumArtist', 'cover', 'artist']);
ok(r.edit!.targets.length === 3, 'alle: kilden selv tælles ikke med');
ok(r.files.slice(1).every((f) => f.cover === src.cover && f.editable.artist === 'Søren'), 'cover og kunstner sat på alle');
ok(r.files[0] === src, 'kilden ændres ikke');

// Nothing to do.
ok(applyShared(files, src, new Set(), ['album']).edit === null, 'ingen mål-filer: ingen ændring');
ok(applyShared(files, src, new Set(['b']), []).edit === null, 'ingen felter: ingen ændring');
ok(applyShared(files, src, new Set(['a']), ['album']).edit === null, 'kun kilden markeret: ingen ændring');

// Empty source fields cannot wipe anything.
const blank = file('x', { album: '  ', year: '' }, null);
ok(!canShare(blank, 'album') && !canShare(blank, 'year') && !canShare(blank, 'cover'), 'tomme kildefelter kan ikke vælges');
const rb = applyShared([blank, ...files.slice(1)], blank, new Set(['b']), ['album', 'year', 'cover']);
ok(rb.edit === null && rb.files[1].editable.album === 'Gammelt' && rb.files[1].cover !== null, 'tomme kildefelter rydder ikke værdier');

// Undo restores each target's own (different) values and saved state.
r = applyShared(files, src, new Set(['b', 'c', 'd']), ['album', 'cover']);
let u = undoShared(r.files, r.edit!);
ok(u.files[1].editable.album === 'Gammelt' && u.files[2].editable.album === 'Andet' && u.files[3].editable.album === 'Urørt', 'fortryd: hver fil får sit eget album tilbage');
ok(u.files[1].cover === files[1].cover && u.files[2].cover === null, 'fortryd: covers tilbage, også "intet cover"');
ok(u.files[1].saved && !u.files[1].dirty && !u.files[2].dirty, 'fortryd: gemt/ugemt som før');
ok(u.kept.length === 0, 'fortryd: intet sprunget over');

// A later edit is not overwritten by undo.
r = applyShared(files, src, new Set(['b', 'c']), ['album', 'year']);
const later = r.files.map((f) => (f.id === 'b' ? { ...f, editable: { ...f.editable, album: 'Rettet bagefter', title: 'Ny titel' } } : f));
u = undoShared(later, r.edit!);
ok(u.files[1].editable.album === 'Rettet bagefter', 'senere rettelse af album bevares');
ok(u.files[1].editable.year === '2001', 'det andet felt fortrydes alligevel');
ok(u.files[1].editable.title === 'Ny titel' && u.files[1].dirty, 'senere titel bevares og filen er stadig ugemt');
ok(u.kept.length === 1 && u.kept[0].id === 'b' && u.kept[0].field === 'album', 'den bevarede rettelse rapporteres');
ok(u.files[2].editable.album === 'Andet' && u.files[2].editable.year === '', 'den anden fil fortrydes helt');

// --- export of real files after a shared edit ---------------------------
console.log('\n=== eksport efter fælles rettelse ===');
const load = (path: string) => {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
type Real = SharedTarget & { read: FileTags; buffer: ArrayBuffer; format: AudioFormat };
const real: Real[] = [];
for (const [id, path] of [['mp3', 'test/fixtures/tagged.mp3'], ['m4a', 'test/fixtures/tagged.m4a']] as const) {
  const buffer = load(path);
  const read = await readFileTags(buffer);
  real.push({ id, read, buffer, format: read.format, editable: { ...read.editable }, cover: read.cover, dirty: false, saved: false });
}
const source = file('kilde', { album: 'Fælles album', albumArtist: 'Fælles kunstner', year: '2024', artist: 'Ny kunstner' }, cover(7));
const applied = applyShared(real, source, new Set(['mp3', 'm4a']), ['album', 'albumArtist', 'year']).files;
for (const f of applied) {
  const { blob } = await saveFile({
    buffer: f.buffer, format: f.read.format, editable: f.editable, cover: f.cover, carried: f.read.carried, outputFormat: f.format,
  });
  const back = await readFileTags(await blob.arrayBuffer());
  ok(back.editable.album === 'Fælles album' && back.editable.year === '2024' && back.editable.albumArtist === 'Fælles kunstner', `${f.id}: fælles felter skrevet`);
  ok(back.editable.title === 'Blæsten går frisk' && back.editable.track === '3/12', `${f.id}: titel og spornummer bevaret`);
  ok(back.editable.artist === 'Søren Ødegård', `${f.id}: kunstner urørt (ikke valgt)`);
  ok((back.cover?.data.length ?? 0) === (f.read.cover?.data.length ?? 0), `${f.id}: eget cover (eller intet) bevaret`);
  ok(f.read.carriedNames.every((n) => back.carriedNames.includes(n)), `${f.id}: øvrige felter bevaret (${back.carriedNames.length})`);
}

if (failures) {
  console.log(`\n${failures} fejl`);
  process.exit(1);
}
console.log('\nalle tests for fælles rettelse bestået');
