import { Mp3Encoder } from '@breezystack/lamejs';

/**
 * PCM to MP3.
 *
 * Kept separate from the worker so it can be tested directly: the worker is
 * only a message-passing shell around this function, and a shell is a poor
 * place to hide the part that can actually be wrong.
 */

/** lamejs wants signed 16-bit samples. */
export function toInt16(input: Float32Array, out: Int16Array): void {
  for (let i = 0; i < input.length; i++) {
    // Clamp before scaling: decoded audio can exceed [-1,1] slightly, and
    // letting that wrap around turns a loud passage into a burst of noise.
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
}

export function encodeMp3(
  channels: Float32Array[],
  sampleRate: number,
  bitrateKbps: number,
  onProgress?: (done: number) => void
): Uint8Array {
  const numChannels = Math.min(channels.length, 2);
  const encoder = new Mp3Encoder(numChannels, sampleRate, bitrateKbps);

  // 1152 samples is one MPEG frame; lamejs is happiest fed whole frames.
  const BLOCK = 1152;
  const total = channels[0].length;
  const parts: Uint8Array[] = [];

  const left = new Int16Array(BLOCK);
  const right = new Int16Array(BLOCK);
  let lastReported = 0;

  for (let offset = 0; offset < total; offset += BLOCK) {
    const len = Math.min(BLOCK, total - offset);
    toInt16(channels[0].subarray(offset, offset + len), left);

    let chunk: Uint8Array;
    if (numChannels === 2) {
      toInt16(channels[1].subarray(offset, offset + len), right);
      chunk = encoder.encodeBuffer(left.subarray(0, len), right.subarray(0, len));
    } else {
      chunk = encoder.encodeBuffer(left.subarray(0, len));
    }
    if (chunk.length > 0) parts.push(new Uint8Array(chunk));

    const done = offset / total;
    if (onProgress && done - lastReported > 0.02) {
      lastReported = done;
      onProgress(done);
    }
  }

  const tail = encoder.flush();
  if (tail.length > 0) parts.push(new Uint8Array(tail));

  const size = parts.reduce((n, p) => n + p.length, 0);
  const mp3 = new Uint8Array(size);
  let off = 0;
  for (const p of parts) { mp3.set(p, off); off += p.length; }
  return mp3;
}
