import { parseBuffer } from 'music-metadata';
import { readFileSync } from 'fs';

const buf = readFileSync('test/fixtures/tagged.mp3');
const md = await parseBuffer(new Uint8Array(buf), { mimeType: 'audio/mpeg' });

console.log('=== versions present ===', Object.keys(md.native));
for (const [ver, frames] of Object.entries(md.native)) {
  console.log(`\n=== ${ver} (${frames.length} frames) ===`);
  for (const f of frames) {
    let v = f.value;
    if (v && typeof v === 'object') {
      if (v.data) v = { ...v, data: `<${v.data.length ?? v.data.byteLength} bytes>` };
      v = JSON.stringify(v);
    }
    console.log(`  ${f.id.padEnd(6)} ${String(v).slice(0, 90)}`);
  }
}
console.log('\n=== common ===');
console.log(JSON.stringify({
  title: md.common.title, artist: md.common.artist, album: md.common.album,
  albumartist: md.common.albumartist, year: md.common.year, track: md.common.track,
}, null, 2));
