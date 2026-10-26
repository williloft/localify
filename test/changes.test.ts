/**
 * The before/after overview: field diffs against the original, covers by
 * their bytes, reverting, format and file name, and the batch counts — on the
 * real fixtures, after a shared edit and its undo too.
 */
import { readFileSync } from 'fs';
import { readFileTags, type AudioFormat, type CoverArt, type EditableTags, type FileTags } from '../src/lib/tags';
import { cachedChangesOf, changesOf, coverChange, sameCover, summarize, type ChangeInput } from '../src/lib/changes';
import { applyShared, undoShared } from '../src/lib/shared';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${msg}`);
  if (!cond) failures++;
};

const load = async (path: string, name: string) => {
  const b = readFileSync(path);
  const read: FileTags = await readFileTags(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  return { id: name, file: { name }, read, editable: { ...read.editable }, cover: read.cover, outputFormat: read.format as AudioFormat, dirty: false, saved: false };
};
const edit = <T extends ChangeInput>(f: T, patch: Partial<EditableTags>): T => ({ ...f, editable: { ...f.editable, ...patch } });

const mp3 = await load('test/fixtures/tagged.mp3', 'Blæsten.mp3');
const m4a = await load('test/fixtures/tagged.m4a', 'Blæsten.m4a');

console.log('\n=== felter ===');
let c = changesOf(mp3, 'title-artist');
ok(c.fields.length === 0 && c.cover === null && c.format === null, 'uændret fil: ingen ændringer');
c = changesOf(edit(mp3, { title: 'Ny titel' }), 'title-artist');
ok(c.fields.length === 1 && c.fields[0].before === 'Blæsten går frisk' && c.fields[0].after === 'Ny titel', 'ændret titel: korrekt før/efter, intet andet');
c = changesOf(edit(mp3, { album: '' }), 'title-artist');
ok(c.fields.length === 1 && c.fields[0].key === 'album' && c.fields[0].after === '', 'ryddet album vises som ryddet');
c = changesOf(edit(edit(mp3, { title: 'Ny titel' }), { title: 'Blæsten går frisk' }), 'title-artist');
ok(c.fields.length === 0, 'tilbage til originalværdien: ingen ændring');

console.log('\n=== cover ===');
const png = (bytes: number[]): CoverArt => ({ mime: 'image/png', data: new Uint8Array(bytes) });
ok(coverChange(null, png([1])) === 'added', 'cover tilføjet');
ok(coverChange(png([1]), png([2])) === 'replaced', 'cover udskiftet');
ok(coverChange(png([1]), null) === 'removed', 'cover fjernet');
ok(coverChange(png([1, 2]), png([1, 2])) === null && sameCover(png([1]), png([1])), 'samme bytes i nyt objekt: ingen ændring');
ok(coverChange(png([1]), { mime: 'image/jpeg', data: new Uint8Array([1]) }) === 'replaced', 'anden mime-type: udskiftet');
ok(changesOf({ ...mp3, cover: { mime: mp3.cover!.mime, data: new Uint8Array(mp3.cover!.data) } }, 'title-artist').cover === null, 'fixture-cover kopieret byte for byte: ingen ændring');
ok(changesOf({ ...mp3, cover: null }, 'title-artist').cover === 'removed', 'fixture-cover fjernet');

console.log('\n=== format og filnavn ===');
c = changesOf({ ...m4a, outputFormat: 'mp3' }, 'title-artist');
ok(c.format?.from === 'm4a' && c.format.to === 'mp3', 'M4A → MP3 vises');
ok(c.lost.length > 0, `felter uden MP3-modstykke kendt før eksport (${c.lost.join(', ')})`);
ok(c.name.to.endsWith('.mp3') && c.name.from === 'Blæsten.m4a', `endeligt filnavn: ${c.name.to}`);
ok(changesOf(m4a, 'title-artist').format === null && changesOf(m4a, 'title-artist').lost.length === 0, 'M4A beholdt: ingen konvertering, intet tab');
ok(changesOf(mp3, 'title-artist').lost.length === mp3.read.unsupported.length, 'MP3: kendte felter, der ikke kan skrives, regnes som tab');
const a = changesOf(mp3, 'title-artist').name.to;
const b = changesOf(mp3, 'artist-title').name.to;
ok(a !== b, `filnavnsmønster ændrer navnet: ${a} / ${b}`);

console.log('\n=== batch ===');
const files = [mp3, m4a, await load('test/fixtures/faststart.m4a', 'Faststart.m4a')];
let s = summarize(files.map((f) => changesOf(f, 'title-artist')));
ok(s.metadata === 0 && s.converting === 0, 'intet ændret: 0 / 0');
const shared = applyShared(files, { id: 'x', editable: { ...mp3.editable, album: 'Fælles' }, cover: null, dirty: false, saved: false }, new Set([mp3.id, m4a.id]), ['album']);
const after = shared.files.map((f, i) => (i === 2 ? { ...f, outputFormat: 'mp3' as AudioFormat } : f));
s = summarize(after.map((f) => changesOf(f, 'title-artist')));
ok(s.metadata === 2 && s.converting === 1 && s.losing >= 1, `efter fælles rettelse og konvertering: ${s.metadata} ændret, ${s.converting} konverteres, ${s.losing} mister felter`);
const undone = undoShared(after, shared.edit!).files;
s = summarize(undone.map((f) => changesOf(f, 'title-artist')));
ok(s.metadata === 0 && s.converting === 1, 'efter fortryd: ingen metadataændring, konverteringen står');

console.log('\n=== cache ===');
const once = cachedChangesOf(mp3, 'title-artist');
ok(cachedChangesOf(mp3, 'title-artist') === once, 'samme fil og mønster: genbrugt');
ok(cachedChangesOf(mp3, 'artist-title') !== once, 'nyt mønster: regnet igen');
ok(cachedChangesOf(edit(mp3, { title: 'x' }), 'title-artist').fields.length === 1, 'ny filobjekt: regnet igen');

if (failures) {
  console.log(`\n${failures} fejl`);
  process.exit(1);
}
console.log('\nalle tests for før/efter bestået');
