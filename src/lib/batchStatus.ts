/** What "Download alle som ZIP" tells the page while it runs and when it is done. */
import { formatNumber } from './fieldLabels';

/** What "Download alle som ZIP" reports when it is done: what was left out, and what went in with a warning. */
export interface BatchNote {
  stopped?: boolean;
  /** Files that went into the zip, out of `total` in the list. Set once the archive is finished and handed to the browser. */
  packed?: number;
  total?: number;
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
  return b.packing ? 'Pakker ZIP…' : `Skriver fil ${formatNumber(b.done + 1)} af ${formatNumber(b.total)}…`;
}

/**
 * The line under the button: what the current phase is, and how many files are
 * actually finished. A file's own conversion percent says "denne fil", so it
 * cannot be read as progress for the whole export. Packing has no percent: the
 * archive is finished in one step that reports nothing before it is done.
 */
export function batchDetail(b: BatchProgress): string {
  if (b.packing) return `Alle ${formatNumber(b.total)} filer er skrevet · lægger dem i én ZIP`;
  const finished = `${formatNumber(b.done)} af ${formatNumber(b.total)} færdige`;
  if (b.fileProgress != null) return `Koder om til MP3 · denne fil ${Math.round(b.fileProgress * 100)} % · ${finished}`;
  return `Skriver metadata · ${finished}`;
}

/** The bar: finished files out of all files, or null (indeterminate) while packing, which has no measure. */
export function batchBar(b: BatchProgress): { value: number; max: number } | null {
  return b.packing ? null : { value: b.done, max: b.total };
}

/** What the page says while files are being read: the file in hand, not the count of finished ones. */
export function readingLabel({ done, total }: { done: number; total: number }): string {
  return total === 1 ? 'Læser filen…' : `Læser fil ${formatNumber(done + 1)} af ${formatNumber(total)}…`;
}

/** Under the reading label: files that are actually done. Null for a single file. */
export function readingDetail({ done, total }: { done: number; total: number }): string | null {
  return total === 1 ? null : `${formatNumber(done)} af ${formatNumber(total)} færdige`;
}

/** The progress figure to announce: every file for short batches, every tenth of the way for long ones. */
export function announced({ done, total }: { done: number; total: number }): number {
  const step = Math.max(1, Math.ceil(total / 10));
  return Math.max(1, Math.floor((done + 1) / step) * step);
}
