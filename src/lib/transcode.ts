/**
 * M4A to MP3, entirely in the browser.
 *
 * The browser already ships an AAC decoder — it is what plays every <audio>
 * tag — and `decodeAudioData` exposes it. So the only piece missing is an MP3
 * encoder, and lamejs is about 100 KB. That is why this needs no ffmpeg.wasm
 * and no server.
 *
 * Be clear about what this costs: AAC to MP3 is lossy-to-lossy. The output
 * inherits every artefact of the original encode and adds its own. It is the
 * right trade only when the destination demands MP3 — Spotify's local files,
 * for instance, do not accept M4A at all — and the UI says so before you click.
 */

import { findPath, parseBoxes } from './mp4';
import type { EncodeDone, EncodeError, EncodeProgress, EncodeRequest } from './mp3encoder.worker';

export const DEFAULT_BITRATE = 320;

/**
 * The audio sample rate, read from the track's `mdhd` timescale.
 *
 * This matters: `decodeAudioData` resamples to the AudioContext's rate, so
 * decoding a 44.1 kHz file in a 48 kHz context silently resamples it — another
 * quality loss on top of the re-encode, for no reason. Creating the context at
 * the source's own rate avoids it.
 */
export function readSampleRate(buffer: ArrayBuffer): number | null {
  const buf = new Uint8Array(buffer);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  const moov = findPath(buf, ['moov']);
  if (!moov) return null;

  for (const trak of parseBoxes(buf, moov.start + moov.headerSize, moov.end)) {
    if (trak.type !== 'trak') continue;
    const mdia = parseBoxes(buf, trak.start + trak.headerSize, trak.end).find((b) => b.type === 'mdia');
    if (!mdia) continue;
    const mdhd = parseBoxes(buf, mdia.start + mdia.headerSize, mdia.end).find((b) => b.type === 'mdhd');
    if (!mdhd) continue;

    const body = mdhd.start + mdhd.headerSize;
    const version = buf[body];
    // v0: created(4) modified(4) timescale(4); v1: created(8) modified(8) timescale(4)
    const timescaleOffset = body + 4 + (version === 1 ? 16 : 8);
    if (timescaleOffset + 4 > mdhd.end) continue;

    const rate = view.getUint32(timescaleOffset);
    // A media timescale equals the audio sample rate for sound tracks, but
    // video and text tracks use conventional values like 600 or 1000.
    if (rate >= 8000 && rate <= 192000) return rate;
  }
  return null;
}

export interface TranscodeOptions {
  bitrateKbps?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** Decode with the browser's own decoder, then encode to MP3 in a worker. */
export async function m4aToMp3(
  buffer: ArrayBuffer,
  { bitrateKbps = DEFAULT_BITRATE, onProgress, signal }: TranscodeOptions = {}
): Promise<Uint8Array> {
  const sampleRate = readSampleRate(buffer) ?? undefined;

  // decodeAudioData detaches the buffer it is given, and the caller still needs
  // the original bytes for its tags — so hand it a copy.
  const forDecode = buffer.slice(0);

  const ctx = new AudioContext(sampleRate ? { sampleRate } : {});
  let audio: AudioBuffer;
  try {
    audio = await ctx.decodeAudioData(forDecode);
  } catch {
    throw new Error('Kunne ikke afkode lyden. Filen kan være beskyttet (DRM) eller beskadiget.');
  } finally {
    // Nothing is played, so the context has done its job either way.
    void ctx.close();
  }

  if (signal?.aborted) throw new Error('Afbrudt');

  const channels: Float32Array[] = [];
  for (let c = 0; c < Math.min(audio.numberOfChannels, 2); c++) {
    channels.push(audio.getChannelData(c));
  }
  if (channels.length === 0) throw new Error('Filen indeholder ingen lyd.');

  const worker = new Worker(new URL('./mp3encoder.worker.ts', import.meta.url), { type: 'module' });

  try {
    return await new Promise<Uint8Array>((resolve, reject) => {
      const onAbort = () => { worker.terminate(); reject(new Error('Afbrudt')); };
      signal?.addEventListener('abort', onAbort, { once: true });

      worker.onmessage = (e: MessageEvent<EncodeProgress | EncodeDone | EncodeError>) => {
        const msg = e.data;
        if (msg.type === 'progress') { onProgress?.(msg.done); return; }
        signal?.removeEventListener('abort', onAbort);
        if (msg.type === 'error') reject(new Error(msg.message));
        else resolve(new Uint8Array(msg.mp3));
      };
      worker.onerror = (e) => {
        signal?.removeEventListener('abort', onAbort);
        reject(new Error(e.message || 'Kodningen fejlede'));
      };

      const req: EncodeRequest = { channels, sampleRate: audio.sampleRate, bitrateKbps };
      // Channel data is transferable, so nothing is copied on the way over.
      worker.postMessage(req, channels.map((c) => c.buffer));
    });
  } finally {
    worker.terminate();
  }
}
