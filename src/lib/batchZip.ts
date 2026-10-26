/**
 * The page's side of the zip worker: add files one at a time, then finish.
 *
 * Aborting the signal terminates the worker at once, even in the middle of
 * packing, and rejects whatever was waiting. `close()` must be called when the
 * batch is over whichever way it ended, so no worker outlives its batch.
 */

import type { ZipRequest, ZipResponse } from './zip.worker';

export interface BatchZip {
  /** Resolves once the worker has the file in the archive. */
  add(name: string, file: Blob): Promise<void>;
  /** Resolves with the finished archive. */
  finish(): Promise<Blob>;
  close(): void;
}

export function openBatchZip(signal: AbortSignal): BatchZip {
  const worker = new Worker(new URL('./zip.worker.ts', import.meta.url), { type: 'module' });
  // The page waits for each answer before it sends the next request, so there is at most one.
  let pending: { resolve: (r: ZipResponse) => void; reject: (e: Error) => void } | null = null;

  const settle = (fn: (p: NonNullable<typeof pending>) => void) => {
    const p = pending;
    pending = null;
    if (p) fn(p);
  };
  const close = () => {
    worker.terminate();
    signal.removeEventListener('abort', onAbort);
    settle((p) => p.reject(new Error('Afbrudt')));
  };
  const onAbort = () => close();
  signal.addEventListener('abort', onAbort, { once: true });

  worker.onmessage = (e: MessageEvent<ZipResponse>) => {
    const msg = e.data;
    settle((p) => (msg.type === 'error' ? p.reject(new Error(msg.message)) : p.resolve(msg)));
  };
  // Out of memory in the worker, or a worker that failed to load.
  worker.onerror = (e) => {
    e.preventDefault();
    settle((p) => p.reject(new Error(e.message || 'Zip-filen kunne ikke laves.')));
  };

  const send = (msg: ZipRequest) =>
    new Promise<ZipResponse>((resolve, reject) => {
      if (signal.aborted) { reject(new Error('Afbrudt')); return; }
      pending = { resolve, reject };
      worker.postMessage(msg);
    });

  return {
    async add(name, file) { await send({ type: 'add', name, file }); },
    async finish() {
      const r = await send({ type: 'finish' });
      if (r.type !== 'done') throw new Error('Zip-filen kunne ikke laves.');
      return r.zip;
    },
    close,
  };
}
