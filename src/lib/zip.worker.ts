/**
 * Packs the batch zip off the main thread.
 *
 * Files arrive one by one as Blobs while the page renders the next one, so the
 * page never holds every file as bytes at once, and building the archive never
 * freezes the tab. The worker is terminated after every batch — success, stop
 * or error — which frees whatever it still holds.
 */

import { ZipBuilder } from './zip';

export type ZipRequest =
  | { type: 'add'; name: string; file: Blob }
  | { type: 'finish' };

export type ZipResponse =
  | { type: 'added' }
  | { type: 'done'; zip: Blob }
  | { type: 'error'; message: string };

const post = (msg: ZipResponse) => (self as unknown as Worker).postMessage(msg);

const builder = new ZipBuilder();
// Reading a Blob is async; chain the messages so files land in the order sent.
let queue: Promise<void> = Promise.resolve();

self.onmessage = (e: MessageEvent<ZipRequest>) => {
  const msg = e.data;
  queue = queue.then(async () => {
    try {
      if (msg.type === 'add') {
        builder.add(msg.name, new Uint8Array(await msg.file.arrayBuffer()));
        post({ type: 'added' });
      } else {
        post({ type: 'done', zip: new Blob(builder.finish() as BlobPart[], { type: 'application/zip' }) });
      }
    } catch (err) {
      post({ type: 'error', message: err instanceof Error ? err.message : 'Zip-filen kunne ikke laves.' });
    }
  });
};
