import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { parseBuffer } from 'music-metadata';
import { encodeMp3, toInt16 } from '../src/lib/encodeMp3';
import { readSampleRate } from '../src/lib/transcode';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${msg}`);
  if (!cond) failures++;
};

console.log('\n--- int16-konvertering ---');
{
  const inp = new Float32Array([0, 1, -1, 0.5, -0.5, 2, -2]);
  const out = new Int16Array(inp.length);
  toInt16(inp, out);
  ok(out[0] === 0, 'nul bliver nul');
  ok(out[1] === 32767, 'fuld positiv udsving rammer 32767');
  ok(out[2] === -32768, 'fuld negativ udsving rammer -32768');
  // The clamp is the point: values above 1.0 occur in decoded audio, and
  // without it they wrap around into loud noise instead of clipping.
  ok(out[5] === 32767, 'over 1.0 klippes i stedet for at wrappe');
  ok(out[6] === -32768, 'under -1.0 klippes i stedet for at wrappe');
}

console.log('\n--- kodning af rigtig lyd ---');
{
  // ffmpeg stands in for the browser's AAC decoder, which is the one piece of
  // the pipeline that only exists inside a browser. Everything after this
  // point is our code.
  const raw = execFileSync('ffmpeg', [
    '-v', 'error', '-i', 'test/fixtures/tagged.m4a',
    '-f', 'f32le', '-acodec', 'pcm_f32le', '-ac', '2', '-ar', '44100', '-',
  ], { maxBuffer: 1 << 28 });

  const interleaved = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const frames = interleaved.length / 2;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    left[i] = interleaved[i * 2];
    right[i] = interleaved[i * 2 + 1];
  }
  console.log(`  afkodet: ${frames} samples pr. kanal ved 44100 Hz`);

  let sawProgress = false;
  const mp3 = encodeMp3([left, right], 44100, 320, () => { sawProgress = true; });
  writeFileSync('test/fixtures/encoded.mp3', mp3);

  ok(mp3.length > 0, 'kodning producerede bytes');
  ok(sawProgress, 'fremdrift blev rapporteret undervejs');
  ok(mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0, 'output starter med en gyldig MPEG frame sync');

  // --- verified by ffmpeg, not by our own code ---
  const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries',
    'format=format_name:stream=codec_name,sample_rate,channels,duration',
    '-of', 'default=noprint_wrappers=1:nokey=0', 'test/fixtures/encoded.mp3'],
    { encoding: 'utf-8' });
  const field = (k: string) => probe.split('\n').find((l) => l.startsWith(k + '='))?.split('=')[1] ?? '';

  console.log('  ffprobe:', probe.trim().split('\n').join(', '));
  ok(field('codec_name') === 'mp3', 'ffprobe genkender det som mp3');
  ok(field('sample_rate') === '44100', 'sample rate bevaret (ingen resampling)');
  ok(field('channels') === '2', 'stereo bevaret');

  const srcDur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', 'test/fixtures/tagged.m4a'], { encoding: 'utf-8' }).trim());
  const outDur = Number(field('duration'));
  ok(Math.abs(outDur - srcDur) < 0.15, `laengde bevaret (${srcDur.toFixed(2)}s -> ${outDur.toFixed(2)}s)`);

  let decodeErr = '';
  try {
    execFileSync('ffmpeg', ['-v', 'error', '-i', 'test/fixtures/encoded.mp3', '-f', 'null', '-'],
      { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    decodeErr = String((e as { stderr?: Buffer }).stderr ?? 'fejl').trim();
  }
  ok(decodeErr === '', `mp3'en afkoder rent${decodeErr ? ` (${decodeErr.slice(0, 100)})` : ''}`);

  const md = await parseBuffer(new Uint8Array(readFileSync('test/fixtures/encoded.mp3')), { mimeType: 'audio/mpeg' });
  console.log(`  music-metadata: ${md.format.container} / ${md.format.codec} / ${md.format.bitrate} bps ${md.format.codecProfile}`);
  ok(md.format.container === 'MPEG', 'music-metadata ser en MPEG-container');
  ok(md.format.codec?.includes('Layer 3') ?? false, 'kodet som MPEG Layer 3');
  ok(md.format.bitrate === 320000, 'bitraten er de 320 kbps der blev bedt om');
}

console.log('\n--- sample rate laest fra mdhd ---');
{
  const f = readFileSync('test/fixtures/tagged.m4a');
  const ab = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
  const rate = readSampleRate(ab);
  console.log('  laest sample rate:', rate);
  // Reading this from the source is what stops decodeAudioData resampling the
  // audio into the context's rate — a second, pointless quality loss.
  ok(rate === 44100, 'sample rate laest korrekt fra mdhd-timescale');
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}\n`);
process.exit(failures === 0 ? 0 : 1);
