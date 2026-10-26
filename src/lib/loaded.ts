import type { AudioFormat, CoverArt, EditableTags, FileTags } from './tags';

/** One file in the list: what was read from it, what is being edited, and where it stands. */
export interface LoadedFile {
  id: string;
  file: File;
  read: FileTags;
  editable: EditableTags;
  cover: CoverArt | null;
  dirty: boolean;
  saved: boolean;
  /** What the download should be. MP3 by default, including for M4A sources. */
  outputFormat: AudioFormat;
}
