import { readFileSync } from 'fs';
import { parseBuffer } from 'music-metadata';
import { readTags, writeTags } from '../src/lib/id3';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${msg}`);
  if (!cond) failures++;
};

const file = readFileSync('test/fixtures/tagged.mp3');
const ab = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;

console.log('\n--- 1. read ---');
const read = await readTags(ab);
console.log('  source version :', read.sourceVersion);
console.log('  editable       :', JSON.stringify(read.editable));
console.log('  carried        :', read.carried.map((c) => c.id).join(', '));
console.log('  unsupported    :', read.unsupported.join(', ') || '(none)');

ok(read.editable.title === 'Blæsten går frisk', 'title read with æ intact');
ok(read.editable.artist === 'Søren Ødegård', 'artist read with ø/å intact');
ok(read.editable.album === 'Årstiderne', 'album read with leading Å');
ok(read.editable.albumArtist === 'Diverse Kunstnere', 'album artist read');
ok(read.editable.year === '1998', 'year read');
ok(read.editable.track === '3/12', 'track read as "3/12"');
ok(read.cover !== null && read.cover.data.length === 83, 'cover read (83 bytes)');
ok(read.unsupported.includes('TENC'), 'TENC reported as unsupported, not silently dropped');
ok(read.unsupported.includes('TOPE'), 'TOPE reported as unsupported');

console.log('\n--- 2. edit title only, write back ---');
const edited = { ...read.editable, title: 'Blæsten går friskere' };
const { blob, failed } = writeTags({
  buffer: ab, editable: edited, cover: read.cover, carried: read.carried,
});
console.log('  write failures :', failed.join(', ') || '(none)');
ok(failed.length === 0, 'every carried frame wrote without error');

const out = new Uint8Array(await blob.arrayBuffer());
const after = await parseBuffer(out, { mimeType: 'audio/mpeg' });
const frames = after.native['ID3v2.3'] ?? [];
const byId = (id: string) => frames.find((f) => f.id === id)?.value;

console.log('\n--- 3. verify round-trip ---');
console.log('  frames out     :', frames.map((f) => f.id).join(', '));

ok(byId('TIT2') === 'Blæsten går friskere', 'edited title written correctly with æ');
ok(byId('TPE1') === 'Søren Ødegård', 'artist preserved untouched');
ok(byId('TALB') === 'Årstiderne', 'album preserved');
ok(byId('TPE2') === 'Diverse Kunstnere', 'album artist preserved');
ok(String(byId('TYER')) === '1998', 'year preserved');
ok(byId('TRCK') === '3/12', 'track preserved');

// The whole point: frames the UI never showed must still be there.
ok(byId('TCOM') === 'Carl Nielsen', 'TCOM composer survived');
ok(byId('TCON') === 'Folk', 'TCON genre survived');
ok(byId('TPUB') === 'Some Label', 'TPUB publisher survived');
ok(String(byId('TBPM')) === '128', 'TBPM survived');
ok(byId('TPOS') === '1/2', 'TPOS disc number survived');
ok(byId('TCOP') === '1998 Some Label', 'TCOP copyright survived');

const comm = byId('COMM') as { text?: string } | undefined;
ok(comm?.text === 'Ripped from vinyl', 'COMM comment text survived');
const uslt = byId('USLT') as { text?: string } | undefined;
ok(uslt?.text === 'la la la', 'USLT lyrics survived');

const rg = frames.find((f) => f.id === 'TXXX:REPLAYGAIN_TRACK_GAIN')?.value;
ok(rg === '-3.21 dB', 'TXXX ReplayGain survived with its description');
const mb = frames.find((f) => f.id === 'TXXX:MusicBrainz Album Id')?.value;
ok(mb === 'abc-123', 'TXXX MusicBrainz id survived');

const apic = byId('APIC') as { data?: Uint8Array } | undefined;
ok(apic?.data?.length === 83, 'cover art survived byte-for-byte');

console.log('\n--- 4. audio stream untouched ---');
const origMd = await parseBuffer(new Uint8Array(file), { mimeType: 'audio/mpeg' });
ok(
  Math.abs((after.format.duration ?? 0) - (origMd.format.duration ?? 0)) < 0.05,
  'duration unchanged (no re-encode)'
);
ok(after.format.bitrate === origMd.format.bitrate, 'bitrate unchanged');

console.log('\n--- 5. file with no tags at all ---');
const bare = readFileSync('test/fixtures/base.mp3');
const bareAb = bare.buffer.slice(bare.byteOffset, bare.byteOffset + bare.byteLength) as ArrayBuffer;
const bareRead = await readTags(bareAb);
ok(bareRead.editable.title === '', 'untagged file reads as empty, no crash');
const bareOut = writeTags({
  buffer: bareAb,
  editable: { ...bareRead.editable, title: 'Nyt Nummer', artist: 'Måne' },
  cover: null, carried: bareRead.carried,
});
const bareAfter = await parseBuffer(new Uint8Array(await bareOut.blob.arrayBuffer()), { mimeType: 'audio/mpeg' });
ok(bareAfter.common.title === 'Nyt Nummer', 'tag written onto a previously untagged file');
ok(bareAfter.common.artist === 'Måne', 'å written onto untagged file');

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}\n`);
process.exit(failures === 0 ? 0 : 1);
