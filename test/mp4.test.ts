import { readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { parseBuffer } from 'music-metadata';
import { readMp4Tags, writeMp4Tags } from '../src/lib/mp4';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${msg}`);
  if (!cond) failures++;
};

/** md5 of the DECODED audio samples. Identical before and after = audio intact. */
function audioHash(path: string): string {
  const out = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-map', '0:a', '-f', 'md5', '-'], {
    encoding: 'utf-8',
  });
  return out.trim();
}

function decodeErrors(path: string): string {
  try {
    execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'null', '-'], { encoding: 'utf-8', stdio: ['ignore', 'ignore', 'pipe'] });
    return '';
  } catch (e: unknown) {
    const err = e as { stderr?: Buffer | string };
    return String(err.stderr ?? 'ukendt fejl').trim();
  }
}

for (const fixture of ['tagged', 'faststart']) {
  const path = `test/fixtures/${fixture}.m4a`;
  console.log(`\n=== ${fixture}.m4a ===`);

  const file = readFileSync(path);
  const ab = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;

  const read = readMp4Tags(ab);
  console.log('  laest        :', JSON.stringify(read.tags));
  console.log('  baaret med   :', read.carriedNames.join(', ') || '(ingen)');
  console.log('  cover        :', read.cover ? `${read.cover.mime}, ${read.cover.data.length} B` : 'ingen');

  ok(read.tags.title === 'Blæsten går frisk', 'titel laest med ae intakt');
  ok(read.tags.artist === 'Søren Ødegård', 'kunstner laest med oe/aa');
  ok(read.tags.album === 'Årstiderne', 'album laest');
  ok(read.tags.albumArtist === 'Diverse Kunstnere', 'albumkunstner laest');
  ok(read.tags.year === '1998', 'aar laest');
  ok(read.tags.track === '3/12', 'spornummer laest som 3/12');
  ok(read.carriedNames.includes('@wrt'), 'komponist baaret med');
  ok(read.carriedNames.includes('@gen'), 'genre baaret med');
  ok(read.carriedNames.includes('@cmt'), 'kommentar baaret med');
  ok(read.carriedNames.includes('disk'), 'disc-nummer baaret med');

  // Edit only the title, write back.
  const out = writeMp4Tags({
    buffer: ab,
    tags: { ...read.tags, title: 'Blæsten går friskere' },
    cover: read.cover,
    carried: read.carried,
  });
  const outPath = `test/fixtures/out-${fixture}.m4a`;
  writeFileSync(outPath, out);

  // --- the check that matters ---
  const errs = decodeErrors(outPath);
  ok(errs === '', `lyden afkoder uden fejl${errs ? ` (${errs.slice(0, 120)})` : ''}`);
  ok(audioHash(outPath) === audioHash(path), 'afkodet lyd er BIT-IDENTISK med originalen');

  const after = await parseBuffer(new Uint8Array(readFileSync(outPath)), { mimeType: 'audio/mp4' });
  ok(after.common.title === 'Blæsten går friskere', 'redigeret titel skrevet korrekt');
  ok(after.common.artist === 'Søren Ødegård', 'kunstner uaendret');
  ok(after.common.album === 'Årstiderne', 'album uaendret');
  ok(after.common.albumartist === 'Diverse Kunstnere', 'albumkunstner uaendret');
  ok(String(after.common.year) === '1998', 'aar uaendret');
  ok(after.common.track?.no === 3 && after.common.track?.of === 12, 'spornummer uaendret');
  ok(after.common.composer?.[0] === 'Carl Nielsen', 'komponist overlevede');
  ok(after.common.genre?.[0] === 'Folk', 'genre overlevede');
  ok(after.common.comment?.length ? true : false, 'kommentar overlevede');
  ok(after.common.disk?.no === 1, 'disc-nummer overlevede');
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}\n`);
process.exit(failures === 0 ? 0 : 1);
