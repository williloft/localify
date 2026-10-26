/**
 * The batch zip, end to end on real file bytes: write tags with saveFile, pack
 * the results with ZipBuilder (what the zip worker runs), unpack, and read the
 * tags back. Checks the archive, not just its file names.
 */
import { readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { unzipSync } from 'fflate';
import { readFileTags, saveFile, type AudioFormat } from '../src/lib/tags';
import { ZipBuilder } from '../src/lib/zip';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${msg}`);
  if (!cond) failures++;
};

const load = (path: string) => {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

// Same-format saves only: converting M4A to MP3 needs the browser's AAC decoder.
const inputs: { path: string; name: string; format: AudioFormat; title: string }[] = [
  { path: 'test/fixtures/tagged.mp3', name: 'Første.mp3', format: 'mp3', title: 'Første spor' },
  { path: 'test/fixtures/tagged.m4a', name: 'Andet.m4a', format: 'm4a', title: 'Andet spor' },
  { path: 'test/fixtures/faststart.m4a', name: 'Tredje.m4a', format: 'm4a', title: 'Tredje spor' },
];

console.log('\n=== batch-zip ===');
const zip = new ZipBuilder();
const written = new Map<string, Uint8Array>();
for (const input of inputs) {
  const buffer = load(input.path);
  const read = await readFileTags(buffer);
  const { blob } = await saveFile({
    buffer,
    format: read.format,
    editable: { ...read.editable, title: input.title },
    cover: read.cover,
    carried: read.carried,
    outputFormat: input.format,
  });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  written.set(input.name, bytes);
  zip.add(input.name, bytes);
}
const chunks = zip.finish();
const size = chunks.reduce((n, c) => n + c.length, 0);
const archive = new Uint8Array(size);
let at = 0;
for (const c of chunks) { archive.set(c, at); at += c.length; }

const entries = unzipSync(archive);
ok(Object.keys(entries).join('|') === inputs.map((i) => i.name).join('|'), 'alle filer i zip, i rækkefølge, med danske tegn i navnet');
for (const input of inputs) {
  const bytes = entries[input.name];
  ok(!!bytes && same(bytes, written.get(input.name)!), `${input.name}: bytes identiske med den skrevne fil`);
  const back = await readFileTags(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  ok(back.format === input.format, `${input.name}: stadig ${input.format}`);
  ok(back.editable.title === input.title, `${input.name}: redigeret titel læst tilbage`);
  ok(back.editable.artist === 'Søren Ødegård', `${input.name}: urørt kunstner bevaret`);
  ok(back.cover === null || back.cover.data.length > 0, `${input.name}: cover læsbart`);
}

// Stored, not deflated: the archive is the files plus small headers.
const payload = [...written.values()].reduce((n, b) => n + b.length, 0);
ok(size - payload < 1024, `ingen komprimering (overhead ${size - payload} B)`);

// Another unzipper than fflate's own, when there is one.
const out = 'test/fixtures/out-batch.zip';
writeFileSync(out, archive);
try {
  execFileSync('unzip', ['-tq', out], { stdio: 'pipe' });
  ok(true, 'unzip -t godkender arkivet');
} catch (e: unknown) {
  const err = e as { code?: string; stdout?: Buffer };
  if (err.code === 'ENOENT') console.log('  SKIP  unzip findes ikke');
  else ok(false, `unzip -t: ${String(err.stdout ?? '')}`);
}

if (failures) {
  console.log(`\n${failures} fejl`);
  process.exit(1);
}
console.log('\nalle zip-tests bestået');
