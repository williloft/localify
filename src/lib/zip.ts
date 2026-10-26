/**
 * A zip built one file at a time.
 *
 * `zipSync` wants every file in memory at once and then builds the whole
 * archive in one go: the files, plus a second copy of all of them as the
 * archive, plus whatever the Blob takes. fflate's streaming `Zip` with
 * `ZipPassThrough` instead adds each file as it is ready, and the bytes pass
 * through untouched, so the archive's chunks are the files' own buffers plus a
 * few small headers.
 *
 * Nothing is compressed: the audio already is, and deflating it again would
 * cost time for a few bytes. That is the same as `zipSync(…, { level: 0 })`.
 *
 * The finished archive is still all in memory, as a list of chunks. Browsers
 * have no portable way to stream a download straight to disk, so the last step
 * is one Blob of the whole archive. What this saves is the extra full copy and
 * the long freeze, not the archive itself.
 */

import { Zip, ZipPassThrough } from 'fflate';

export class ZipBuilder {
  private zip: Zip;
  private chunks: Uint8Array[] = [];
  private error: Error | null = null;
  private ended = false;

  constructor() {
    this.zip = new Zip((err, chunk, final) => {
      if (err) { this.error = err; return; }
      this.chunks.push(chunk);
      if (final) this.ended = true;
    });
  }

  /** Add one file. `name` must already be unique within the archive. */
  add(name: string, data: Uint8Array): void {
    const entry = new ZipPassThrough(name);
    this.zip.add(entry);
    entry.push(data, true);
    if (this.error) throw this.error;
  }

  /** Write the central directory and hand over every chunk, in order. */
  finish(): Uint8Array[] {
    this.zip.end();
    if (this.error) throw this.error;
    if (!this.ended) throw new Error('Zip-filen blev ikke færdig.');
    const out = this.chunks;
    this.chunks = [];
    return out;
  }
}
