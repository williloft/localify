/** What "Download alle som ZIP" tells the page while it runs and when it is done. */
import { formatNumber } from './fieldLabels';

/** What "Download alle som ZIP" reports when it is done: what was left out, and what went in with a warning. */
export interface BatchNote {
  stopped?: boolean;
  /** A whole-batch failure, such as a zip too large for the browser. */
  failed?: string;
  skipped: string[];
  warnings: string[];
}

/** Where "Download alle som ZIP" is: which file, how far a conversion has come, or finishing the zip. */
export interface BatchProgress {
  done: number;
  total: number;
  /** 0–1 while the current file is converted to MP3, null otherwise. */
  fileProgress?: number | null;
  /** Every file is in; the archive is being finished. */
  packing?: boolean;
}

/** The button's text while a batch runs. Short, so it fits the 300px list on every screen. */
export function batchLabel(b: BatchProgress): string {
  return b.packing ? 'Pakker zip-filen…' : `Gemmer ${formatNumber(b.done + 1)} af ${formatNumber(b.total)}…`;
}

/** The line under the button: what the current file is going through. */
export function batchDetail(b: BatchProgress, files: number): string {
  if (b.packing) return 'Lægger filerne sammen i én zip-fil';
  if (b.fileProgress != null) return `Koder om til MP3 · ${Math.round(b.fileProgress * 100)} %`;
  return `${formatNumber(files)} filer i én zip-fil`;
}

/** The progress figure to announce: every file for short batches, every tenth of the way for long ones. */
export function announced({ done, total }: { done: number; total: number }): number {
  const step = Math.max(1, Math.ceil(total / 10));
  return Math.max(1, Math.floor((done + 1) / step) * step);
}
