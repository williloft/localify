/**
 * MP3 encoding, off the main thread.
 *
 * Encoding a five-minute track takes seconds of solid CPU. On the main thread
 * that is a frozen tab — no spinner, no cancel, nothing. Here it is just a
 * message. The actual encoding lives in ./encodeMp3 so it can be tested
 * without a browser.
 */

import { encodeMp3 } from './encodeMp3';

export interface EncodeRequest {
  /** One Float32Array per channel, samples in [-1, 1]. */
  channels: Float32Array[];
  sampleRate: number;
  bitrateKbps: number;
}

export interface EncodeProgress { type: 'progress'; done: number }
export interface EncodeDone { type: 'done'; mp3: ArrayBuffer }
export interface EncodeError { type: 'error'; message: string }

const post = (msg: unknown, transfer?: Transferable[]) =>
  (self as unknown as Worker).postMessage(msg, transfer ?? []);

self.onmessage = (e: MessageEvent<EncodeRequest>) => {
  try {
    const { channels, sampleRate, bitrateKbps } = e.data;
    const mp3 = encodeMp3(channels, sampleRate, bitrateKbps, (done) =>
      post({ type: 'progress', done } satisfies EncodeProgress)
    );
    // Copy out of the (possibly shared-backed) view into a plain ArrayBuffer so
    // it can be transferred rather than structured-cloned.
    const out = new Uint8Array(mp3).buffer;
    post({ type: 'done', mp3: out } satisfies EncodeDone, [out]);
  } catch (err) {
    post({
      type: 'error',
      message: err instanceof Error ? err.message : 'Kodning fejlede',
    } satisfies EncodeError);
  }
};
